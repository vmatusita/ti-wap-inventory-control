import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { CategoriaAtivo } from '@/lib/dominio'

// Lista detalhada de pendências para a página interna /pendencias (só operador —
// F6A/A5). Lê a v_pendencias ESTENDIDA (0028). Roda sob o client do operador
// (RLS); o viewer nunca chega aqui (o proxy bloqueia /pendencias). `desde` e a
// ordenação vêm do banco; o bucket é derivado do texto de `pendencia`.

const PAGE_SIZE = 30

export type TipoPendencia = 'termo' | 'itens' | 'triagem' | 'outras'

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
export function classificarPendencia(pendencia: string | null): TipoPendencia {
  if (pendencia === 'termo pendente') return 'termo'
  if (pendencia === 'triagem parada') return 'triagem'
  if (pendencia?.toLowerCase().startsWith('itens faltantes')) return 'itens'
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
  else if (opts.tipo === 'outras')
    query = query
      .not('pendencia', 'eq', 'termo pendente')
      .not('pendencia', 'eq', 'triagem parada')
      .not('pendencia', 'ilike', 'itens faltantes%')

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
