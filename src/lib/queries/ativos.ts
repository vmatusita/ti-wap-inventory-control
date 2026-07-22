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

// Teto de palavras por busca — cada palavra vira um grupo `.or()`, então limita o
// tamanho da query (e é mais que suficiente p/ "marca modelo patrimônio").
const MAX_PALAVRAS_BUSCA = 10

// Quebra o termo em palavras já saneadas. A busca é "campo único": CADA palavra
// precisa casar em ALGUM dos campos varridos (E entre palavras, OU entre campos),
// então "dell latitude" casa marca "Dell" + modelo "Latitude 5420" como se
// marca+modelo fossem um campo só — em qualquer ordem, e cruzando com patrimônio/
// colaborador. Cada palavra é aplicada como um `.or()` separado (o PostgREST
// combina múltiplos `.or()` com AND). Ver `listarAtivos`/`buscarAtivosParaCombobox`.
function palavrasDaBusca(term: string): string[] {
  return sanitizeTerm(term)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_PALAVRAS_BUSCA)
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

  // Busca livre "campo único" (spec §6 tela 3 / OS-F2 3.1.2): cada palavra do termo
  // precisa casar em patrimonio OU colaborador OU marca OU modelo. Trata marca+modelo
  // como um texto só ("dell latitude" acha marca "Dell" + modelo "Latitude 5420").
  for (const palavra of params.q ? palavrasDaBusca(params.q) : []) {
    query = query.or(
      `patrimonio.ilike.%${palavra}%,colaborador_atual.ilike.%${palavra}%,marca.ilike.%${palavra}%,modelo.ilike.%${palavra}%`,
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
  // Quem está com o ativo hoje (F9/M2): a busca do combobox varre este campo e o
  // dropdown mostra o nome — "qual notebook é de qual Fulano".
  colaborador_atual: string | null
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
    colaborador_atual: string | null
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
    colaborador_atual: r.colaborador_atual,
    filial_id: r.filial_id,
    filial_nome: r.filiais?.nome ?? '—',
    termo_assinado: r.termo_assinado,
    patrimonio_duplicado: duplicado,
  }
}

const RESUMO_SELECT =
  'id, patrimonio, service_tag, categoria, marca, modelo, status, colaborador_atual, filial_id, termo_assinado, filiais(slug, nome)'

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

// Busca do combobox (OS-F2 3.5.1): "campo único" por patrimônio OU marca OU modelo
// OU service tag OU hostname (F7E — o ativo sem patrimônio precisa ser encontrável
// no fluxo de movimentação; a plaqueta pode não existir, mas a tag/hostname
// identificam) OU colaborador atual (F9/M2 — a lista `/ativos` já buscava por
// colaborador e o combobox não; quem sabe o nome do colaborador não precisa mais
// descobrir o patrimônio antes de movimentar).
// Cada palavra do termo casa em algum campo ("dell latitude" acha
// marca "Dell" + modelo "Latitude 5420"). Até 12 resultados. Ordena null-last
// (patrimônio nulo cai no fim; NULLS FIRST é o default do PostgREST em asc, então
// força nullsFirst:false).
export async function buscarAtivosParaCombobox(
  term: string,
): Promise<AtivoResumo[]> {
  const palavras = palavrasDaBusca(term)
  // Guarda de 2 chars: evita varrer a base com termo curtíssimo (era `termo.length < 2`).
  if (palavras.join('').length < 2) return []
  const supabase = await createClient()

  let query = supabase.from('ativos').select(RESUMO_SELECT)
  for (const palavra of palavras) {
    query = query.or(
      `patrimonio.ilike.%${palavra}%,colaborador_atual.ilike.%${palavra}%,marca.ilike.%${palavra}%,modelo.ilike.%${palavra}%,service_tag.ilike.%${palavra}%,hostname.ilike.%${palavra}%`,
    )
  }

  const { data, error } = await query
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

// Linha do export CSV de ativos (F10/T5 — CONTRATO §1.5 da OS-F10).
export type LinhaExportAtivo = {
  patrimonio: string | null
  service_tag: string | null
  hostname: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  filial_nome: string
  status: StatusAtivo
  colaborador_atual: string | null
  setor_atual: string | null
}

// Leitura em blocos p/ o export CSV (F10/T5). Mesmos filtros e ordem de
// `listarAtivos`, sem paginação de tela: acumula em blocos de `.range()` porque o
// Max Rows do PostgREST corta requests grandes EM SILÊNCIO. `total` vem de
// count 'exact'; quem decide "truncado" é a camada de cima, por
// `linhas.length < total`.
export async function listarAtivosParaExport(
  params: ListarAtivosParams,
  cap = 5000,
): Promise<{ linhas: LinhaExportAtivo[]; total: number }> {
  // F10-STUB-W1: implementação é entrega 7 do subagente W1 (dono deste arquivo).
  // Este corpo existe só para fixar a assinatura do CONTRATO §1.5 e destravar o
  // W4 em paralelo — TEM de ser substituído antes do merge na main.
  void params
  void cap
  throw new Error('F10-STUB-W1: listarAtivosParaExport ainda não implementada')
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
