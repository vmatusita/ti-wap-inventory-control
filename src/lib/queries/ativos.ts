import { createClient } from '@/lib/supabase/server'
import type {
  CategoriaAtivo,
  StatusAtivo,
  TermoStatus,
} from '@/lib/dominio'
import { patrimoniosRepetidos } from '@/lib/patrimonio'
import type { Tables } from '@/lib/types/database'

export const PAGE_SIZE = 50

// Linha da LISTA de ativos (OS-F2 3.1).
export type AtivoLista = {
  id: string
  // null = ativo sem patrimônio físico (import F7E) — a UI mostra "sem patrimônio".
  patrimonio: string | null
  service_tag: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  status: StatusAtivo
  colaborador_atual: string | null
  filial_nome: string
  updated_at: string
}

export type ListarAtivosParams = {
  q?: string
  filialId?: number
  categoria?: CategoriaAtivo
  status?: StatusAtivo[]
  // Só ativos sem patrimônio físico (pendência 'sem patrimônio físico' — F7E).
  semPatrimonio?: boolean
  page?: number
}

export type ListarAtivosResult = {
  rows: AtivoLista[]
  total: number
  page: number
  pageSize: number
  // patrimonios que aparecem mais de uma vez NA PAGINA — a lista mostra a
  // coluna Service Tag p/ desambiguar (OS-F2 3.1.4).
  patrimoniosDuplicados: Set<string>
}

// Remove caracteres que quebram o parser do filtro `.or()` do PostgREST.
function sanitizeTerm(term: string): string {
  return term.replace(/[,()%*\\]/g, ' ').trim()
}

type FilialEmbed = { slug: string; nome: string } | null

// Lista paginada, filtrada e ordenada por "atualizado em" desc (OS-F2 3.1.2).
export async function listarAtivos(
  params: ListarAtivosParams,
): Promise<ListarAtivosResult> {
  const supabase = await createClient()
  const page = Math.max(1, params.page ?? 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('ativos')
    .select(
      'id, patrimonio, service_tag, categoria, marca, modelo, status, colaborador_atual, updated_at, filiais(slug, nome)',
      { count: 'exact' },
    )

  const termo = params.q ? sanitizeTerm(params.q) : ''
  if (termo) {
    // Busca livre: patrimonio OU colaborador OU modelo (spec §6.3 / OS-F2 3.1.2).
    query = query.or(
      `patrimonio.ilike.%${termo}%,colaborador_atual.ilike.%${termo}%,modelo.ilike.%${termo}%`,
    )
  }
  if (params.filialId) query = query.eq('filial_id', params.filialId)
  if (params.categoria) query = query.eq('categoria', params.categoria)
  if (params.status && params.status.length > 0) {
    query = query.in('status', params.status)
  }
  if (params.semPatrimonio) query = query.is('patrimonio', null)

  query = query.order('updated_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(`Falha ao listar ativos: ${error.message}`)

  const rows: AtivoLista[] = (data ?? []).map((r) => {
    const filial = r.filiais as FilialEmbed
    return {
      id: r.id,
      patrimonio: r.patrimonio,
      service_tag: r.service_tag,
      categoria: r.categoria,
      marca: r.marca,
      modelo: r.modelo,
      status: r.status,
      colaborador_atual: r.colaborador_atual,
      filial_nome: filial?.nome ?? '—',
      updated_at: r.updated_at,
    }
  })

  // Patrimônios null (ativos sem plaqueta) não entram na conta de duplicidade.
  const patrimoniosDuplicados = patrimoniosRepetidos(
    rows.map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )

  return {
    rows,
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    patrimoniosDuplicados,
  }
}

// Ficha completa do ativo (OS-F2 3.2).
export type AtivoFicha = Tables<'ativos'> & {
  filial_nome: string
  filial_slug: string
}

export async function buscarAtivoPorId(id: string): Promise<AtivoFicha | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ativos')
    .select('*, filiais(slug, nome)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar ativo: ${error.message}`)
  if (!data) return null

  const { filiais, ...ativo } = data
  const filial = filiais as FilialEmbed
  return {
    ...(ativo as Tables<'ativos'>),
    filial_nome: filial?.nome ?? '—',
    filial_slug: filial?.slug ?? '',
  }
}

// Anotação avulsa na linha do tempo (F3B). Imutável, com autor + data/hora.
export type AnotacaoTimeline = {
  id: string
  texto: string
  autor_nome: string | null
  created_at: string
}

export async function listarAnotacoesDoAtivo(
  ativoId: string,
): Promise<AnotacaoTimeline[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('anotacoes')
    .select('id, texto, created_at, autor:profiles!anotacoes_criado_por_fkey(nome)')
    .eq('ativo_id', ativoId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Falha ao carregar anotações: ${error.message}`)
  type Row = {
    id: string
    texto: string
    created_at: string
    autor: { nome: string | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    texto: r.texto,
    autor_nome: r.autor?.nome ?? null,
    created_at: r.created_at,
  }))
}

// Resumo p/ chip/combobox do fluxo de movimentacao.
export type AtivoResumo = {
  id: string
  // null = ativo sem patrimônio físico (import F7E) — a UI mostra "sem patrimônio".
  patrimonio: string | null
  service_tag: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  status: StatusAtivo
  filial_id: number
  filial_nome: string
  termo_assinado: TermoStatus | null
  patrimonio_duplicado: boolean
}

function resumoDe(
  r: {
    id: string
    patrimonio: string | null
    service_tag: string | null
    categoria: CategoriaAtivo
    marca: string | null
    modelo: string | null
    status: StatusAtivo
    filial_id: number
    termo_assinado: TermoStatus | null
    filiais: FilialEmbed
  },
  duplicado: boolean,
): AtivoResumo {
  return {
    id: r.id,
    patrimonio: r.patrimonio,
    service_tag: r.service_tag,
    categoria: r.categoria,
    marca: r.marca,
    modelo: r.modelo,
    status: r.status,
    filial_id: r.filial_id,
    filial_nome: r.filiais?.nome ?? '—',
    termo_assinado: r.termo_assinado,
    patrimonio_duplicado: duplicado,
  }
}

const RESUMO_SELECT =
  'id, patrimonio, service_tag, categoria, marca, modelo, status, filial_id, termo_assinado, filiais(slug, nome)'

// Quais desses patrimonios existem em mais de um ativo (duplicidade legitima §5).
async function patrimoniosDuplicados(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patrimonios: string[],
): Promise<Set<string>> {
  const unicos = [...new Set(patrimonios)]
  if (unicos.length === 0) return new Set()
  const { data, error } = await supabase
    .from('ativos')
    .select('patrimonio')
    .in('patrimonio', unicos)
  if (error) return new Set()
  return patrimoniosRepetidos(
    (data ?? []).map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )
}

// Busca do combobox (OS-F2 3.5.1): por patrimônio OU modelo OU service tag OU
// hostname (F7E — o ativo sem patrimônio precisa ser encontrável no fluxo de
// movimentação; a plaqueta pode não existir, mas a tag/hostname identificam). Até
// 12 resultados. Ordena null-last (patrimônio nulo cai no fim; NULLS FIRST é o
// default do PostgREST em asc, então força nullsFirst:false).
export async function buscarAtivosParaCombobox(
  term: string,
): Promise<AtivoResumo[]> {
  const termo = sanitizeTerm(term)
  if (termo.length < 2) return []
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ativos')
    .select(RESUMO_SELECT)
    .or(
      `patrimonio.ilike.%${termo}%,modelo.ilike.%${termo}%,service_tag.ilike.%${termo}%,hostname.ilike.%${termo}%`,
    )
    .order('patrimonio', { ascending: true, nullsFirst: false })
    .limit(12)

  if (error) throw new Error(`Falha na busca de ativos: ${error.message}`)
  const rows = (data ?? []) as unknown as Parameters<typeof resumoDe>[0][]
  const dups = await patrimoniosDuplicados(
    supabase,
    rows.map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )
  return rows.map((r) =>
    resumoDe(r, r.patrimonio !== null && dups.has(r.patrimonio)),
  )
}

// Resumo de um ativo por id (preselecao vinda da ficha / duplicar).
export async function buscarAtivoResumo(id: string): Promise<AtivoResumo | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ativos')
    .select(RESUMO_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar ativo: ${error.message}`)
  if (!data) return null
  const row = data as unknown as Parameters<typeof resumoDe>[0]
  const dups = await patrimoniosDuplicados(
    supabase,
    row.patrimonio !== null ? [row.patrimonio] : [],
  )
  return resumoDe(row, row.patrimonio !== null && dups.has(row.patrimonio))
}
