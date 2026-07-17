import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { PENDENCIA_SEM_PATRIMONIO, type CategoriaAtivo } from '@/lib/dominio'

// Prefixo do texto de pendência de patrimônio NÃO CANÔNICO gravado pelo go-live
// F4 (literal completo: 'patrimônio não canônico (importado como veio da
// planilha)'). Usamos só o PREFIXO — o filtro `.or()` do PostgREST parte a vírgula
// como separador de condições e trata parênteses como agrupamento, então NUNCA
// incluir a parte "(importado…)". `%prefixo%` casa o literal completo.
const PENDENCIA_PATRIMONIO_NAO_CANONICO = 'patrimônio não canônico'

// Lista detalhada de pendências para a página interna /pendencias (só operador —
// F6A/A5). Lê a v_pendencias ESTENDIDA (0028). Roda sob o client do operador
// (RLS); o viewer nunca chega aqui (o proxy bloqueia /pendencias). `desde` e a
// ordenação vêm do banco; o bucket é derivado do texto de `pendencia`.

const PAGE_SIZE = 30

export type TipoPendencia = 'termo' | 'itens' | 'triagem' | 'patrimonio' | 'outras'

export type PendenciaDetalhe = {
  id: string
  patrimonio: string | null
  categoria: CategoriaAtivo | null
  filialSlug: string | null
  filialNome: string | null
  pendencia: string | null
  colaborador: string | null
  setor: string | null
  marca: string | null
  modelo: string | null
  tipo: TipoPendencia
  desde: string | null // timestamptz
}

export type ListaPendencias = {
  rows: PendenciaDetalhe[]
  total: number
  page: number
  pageSize: number
}

// Deriva o bucket a partir do texto canônico da view (mesmos rótulos de getPendencias).
// O bucket 'patrimonio' (F7E) casa quando a pendência CONTÉM 'sem patrimônio físico'
// (importados sem plaqueta) OU 'patrimônio não canônico' (os 61 do go-live F4). A
// pendência é `;`-joinable, então usamos `includes` (não igualdade) — coerente com
// o filtro SQL de `listarPendencias` (ilike %...%). Precede o fallback 'outras'.
export function classificarPendencia(pendencia: string | null): TipoPendencia {
  if (pendencia === 'termo pendente') return 'termo'
  if (pendencia === 'triagem parada') return 'triagem'
  const p = pendencia?.toLowerCase() ?? ''
  if (p.startsWith('itens faltantes')) return 'itens'
  if (
    p.includes(PENDENCIA_SEM_PATRIMONIO.toLowerCase()) ||
    p.includes(PENDENCIA_PATRIMONIO_NAO_CANONICO.toLowerCase())
  ) {
    return 'patrimonio'
  }
  return 'outras'
}

export async function listarPendencias(opts: {
  filialSlug?: string | null
  tipo?: TipoPendencia | null
  q?: string | null
  page?: number
}): Promise<ListaPendencias> {
  const client = await createClient()
  const page = Math.max(1, opts.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = client
    .from('v_pendencias')
    .select(
      'id, patrimonio, categoria, filial, filial_nome, pendencia, colaborador_atual, setor_atual, marca, modelo, desde',
      { count: 'exact' },
    )
    .order('desde', { ascending: true, nullsFirst: false })
    .range(from, to)

  if (opts.filialSlug) query = query.eq('filial', opts.filialSlug)

  if (opts.tipo === 'termo') query = query.eq('pendencia', 'termo pendente')
  else if (opts.tipo === 'triagem') query = query.eq('pendencia', 'triagem parada')
  else if (opts.tipo === 'itens') query = query.ilike('pendencia', 'itens faltantes%')
  else if (opts.tipo === 'patrimonio')
    // Sem plaqueta (F7E) OU não canônico (go-live F4). Literais SEM vírgula/parênteses
    // (footgun do `.or()` do PostgREST) — só os prefixos.
    query = query.or(
      `pendencia.ilike.%${PENDENCIA_SEM_PATRIMONIO}%,pendencia.ilike.%${PENDENCIA_PATRIMONIO_NAO_CANONICO}%`,
    )
  else if (opts.tipo === 'outras')
    query = query
      .not('pendencia', 'eq', 'termo pendente')
      .not('pendencia', 'eq', 'triagem parada')
      .not('pendencia', 'ilike', 'itens faltantes%')
      .not('pendencia', 'ilike', `%${PENDENCIA_SEM_PATRIMONIO}%`)
      .not('pendencia', 'ilike', `%${PENDENCIA_PATRIMONIO_NAO_CANONICO}%`)

  const termo = opts.q?.trim()
  if (termo) {
    // Sanitiza os metacaracteres do PostgREST/ILIKE antes de interpolar no .or()
    const esc = termo.replace(/[%,()]/g, ' ')
    query = query.or(`patrimonio.ilike.%${esc}%,colaborador_atual.ilike.%${esc}%`)
  }

  const { data, error, count } = await query
  if (error) throw new Error(`Falha ao listar pendências: ${error.message}`)

  const rows: PendenciaDetalhe[] = (data ?? []).map((r) => ({
    id: r.id as string,
    patrimonio: r.patrimonio,
    categoria: r.categoria,
    filialSlug: r.filial,
    filialNome: r.filial_nome,
    pendencia: r.pendencia,
    colaborador: r.colaborador_atual,
    setor: r.setor_atual,
    marca: r.marca,
    modelo: r.modelo,
    tipo: classificarPendencia(r.pendencia),
    desde: r.desde,
  }))

  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE }
}
