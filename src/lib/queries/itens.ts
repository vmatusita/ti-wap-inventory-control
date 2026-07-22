import { createClient } from '@/lib/supabase/server'
import { hojeISO } from '@/lib/format'
import { BLOCO_EXPORT, CAP_EXPORT, MAX_BLOCOS_EXPORT } from '@/lib/csv'
import type { GrupoItem, TipoLancamento } from '@/lib/dominio'

// Leituras da operação de itens por quantidade (F3B / OS 3.3.4). Rota só do
// operador (o visualizador por senha não acessa /itens) — usam o client do
// servidor com a sessão do operador (RLS authenticated). As agregações do
// RELATÓRIO (grupos 2–3) vivem em src/lib/queries/relatorios.ts (recebem o
// client resolvido, pois servem também a sessão por senha).

export type ItemCatalogo = { id: number; nome: string; grupo: GrupoItem }

export type ItemAdmin = {
  id: number
  nome: string
  grupo: GrupoItem
  ordem: number
  ativo: boolean
  lancamentos: number
}

export type SaldoItem = {
  item_id: number
  item: string
  grupo: GrupoItem
  ordem: number
  total: number
  estoque: number
  atrelados: number
  falta: number
}

export type LancamentoHistorico = {
  id: string
  data: string
  tipo: TipoLancamento
  quantidade: number
  item: string
  grupo: GrupoItem
  filial: string
  chamado: string | null
  colaborador: string | null
  observacao: string | null
  ehEstorno: boolean
  estornado: boolean
  created_at: string
}

export type UltimoLancamento = {
  item_id: number
  filial_id: number
  tipo: TipoLancamento
  chamado: string | null
  colaborador: string | null
}

// Catálogo ativo, para o combobox de lançamento (poucos itens — sem busca server).
export async function listarItensAtivos(): Promise<ItemCatalogo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('itens')
    .select('id, nome, grupo')
    .eq('ativo', true)
    .order('grupo', { ascending: true })
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar itens: ${error.message}`)
  return (data ?? []) as ItemCatalogo[]
}

// Catálogo completo + contagem de lançamentos (admin decide desativar × excluir).
export async function listarItensAdmin(): Promise<ItemAdmin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('itens')
    .select('id, nome, grupo, ordem, ativo, lancamentos_item(count)')
    .order('grupo', { ascending: true })
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar itens: ${error.message}`)
  type Row = {
    id: number
    nome: string
    grupo: GrupoItem
    ordem: number
    ativo: boolean
    lancamentos_item: { count: number }[]
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    nome: r.nome,
    grupo: r.grupo,
    ordem: r.ordem,
    ativo: r.ativo,
    lancamentos: r.lancamentos_item?.[0]?.count ?? 0,
  }))
}

// Saldo/atrelados/falta por item (as-of hoje) para a filial selecionada, ou
// consolidado (filialId null). Reaproveita a RPC rel_saldo_itens (0016).
export async function getSaldosItens(filialId: number | null): Promise<SaldoItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rel_saldo_itens', {
    p_filial: filialId,
    p_ate: hojeISO(),
  })
  if (error) throw new Error(`Falha ao ler saldos: ${error.message}`)
  return (data ?? []).map((r) => ({
    item_id: r.item_id,
    item: r.item,
    grupo: r.grupo,
    ordem: r.ordem,
    total: Number(r.total),
    estoque: Number(r.estoque),
    atrelados: Number(r.atrelados),
    falta: Number(r.falta),
  }))
}

type RawLancRow = {
  id: string
  data: string
  tipo: TipoLancamento
  quantidade: number
  chamado: string | null
  colaborador: string | null
  observacao: string | null
  estorna_id: string | null
  created_at: string
  item: { nome: string; grupo: GrupoItem } | null
  filial: { nome: string } | null
}

const LANC_SELECT =
  'id, data, tipo, quantidade, chamado, colaborador, observacao, estorna_id, created_at, ' +
  'item:itens!lancamentos_item_item_id_fkey(nome, grupo), ' +
  'filial:filiais!lancamentos_item_filial_id_fkey(nome)'

// Filtros do histórico (F9 · I3), sem paginação — compartilhados pela tabela da
// tela e pelo export CSV (F10 · T5), para o arquivo sair com EXATAMENTE as
// linhas do filtro visível.
export type FiltrosHistorico = {
  filialId?: number | null
  itemId?: number | null
  tipo?: TipoLancamento | null
  de?: string | null
  ate?: string | null
}

// Query base (filtros + ordem, sem faixa). O período é sobre a coluna `data` — a
// MESMA exibida na tabela do histórico; `created_at` divergiria do que o
// operador vê (um lançamento de ontem registrado hoje). Devolve uma query NOVA a
// cada chamada: o builder do postgrest-js é mutável e não se reexecuta com
// segurança.
function queryHistorico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: FiltrosHistorico,
) {
  let q = supabase.from('lancamentos_item').select(LANC_SELECT, { count: 'exact' })
  if (opts.filialId) q = q.eq('filial_id', opts.filialId)
  if (opts.itemId) q = q.eq('item_id', opts.itemId)
  if (opts.tipo) q = q.eq('tipo', opts.tipo)
  if (opts.de) q = q.gte('data', opts.de)
  if (opts.ate) q = q.lte('data', opts.ate)
  return q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
}

// Linha do CSV do histórico (F10 · T5). É o histórico da tela MENOS `estornado`:
// saber se uma linha JÁ FOI estornada exige a 2ª consulta com todos os ids, que
// num export de milhares de linhas estouraria o limite de tamanho da URL. O CSV
// reporta só `ehEstorno` (derivado de `estorna_id`, que vem na própria linha).
export type LinhaExportHistorico = Omit<LancamentoHistorico, 'estornado'>

function mapearLancamento(r: RawLancRow): LinhaExportHistorico {
  return {
    id: r.id,
    data: r.data,
    tipo: r.tipo,
    quantidade: r.quantidade,
    item: r.item?.nome ?? '—',
    grupo: r.item?.grupo ?? 'acessorio',
    filial: r.filial?.nome ?? '—',
    chamado: r.chamado,
    colaborador: r.colaborador,
    observacao: r.observacao,
    ehEstorno: r.estorna_id != null,
    created_at: r.created_at,
  }
}

// Histórico paginado (mais recente primeiro), com sinalização de estorno.
// Filtros (F9 · I3): filial, item, tipo e período.
export async function getHistoricoLancamentos(
  opts: FiltrosHistorico & { page?: number; pageSize?: number },
): Promise<{ rows: LancamentoHistorico[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = opts.pageSize ?? 20
  const from = (page - 1) * pageSize

  const { data, error, count } = await queryHistorico(supabase, opts).range(
    from,
    from + pageSize - 1,
  )
  if (error) throw new Error(`Falha ao listar lançamentos: ${error.message}`)
  const rows = (data ?? []) as unknown as RawLancRow[]

  // Quais destas linhas já foram estornadas (algum lançamento aponta-as)?
  const ids = rows.map((r) => r.id)
  const estornadas = new Set<string>()
  if (ids.length) {
    const { data: est } = await supabase
      .from('lancamentos_item')
      .select('estorna_id')
      .in('estorna_id', ids)
    for (const e of est ?? []) if (e.estorna_id) estornadas.add(e.estorna_id)
  }

  return {
    rows: rows.map((r) => ({
      ...mapearLancamento(r),
      estornado: estornadas.has(r.id),
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
}

// Leitura em BLOCOS do histórico para o export CSV (F10 · T5): mesmos filtros e
// mesma ordem da tela, sem a paginação de 20. Cada volta pede uma faixa nova a
// partir do que JÁ chegou — nunca de um múltiplo fixo —, porque o Max Rows do
// PostgREST (padrão 1.000 no Supabase) corta o request maior EM SILÊNCIO e
// devolve menos linhas do que o pedido; avançar pelo recebido mantém o export
// correto seja qual for esse teto. Não faz o lookup de "já estornada" (ver
// `LinhaExportHistorico`). Quem decide "truncado" é a camada de cima, comparando
// `linhas.length < total`.
export async function listarHistoricoParaExport(
  opts: FiltrosHistorico,
  cap = CAP_EXPORT,
): Promise<{ linhas: LinhaExportHistorico[]; total: number }> {
  const supabase = await createClient()
  const linhas: LinhaExportHistorico[] = []
  let total = 0

  for (let volta = 0; volta < MAX_BLOCOS_EXPORT && linhas.length < cap; volta++) {
    const tamanho = Math.min(BLOCO_EXPORT, cap - linhas.length)
    const { data, error, count } = await queryHistorico(supabase, opts).range(
      linhas.length,
      linhas.length + tamanho - 1,
    )
    if (error) throw new Error(`Falha ao exportar lançamentos: ${error.message}`)
    total = count ?? total
    const recebidas = (data ?? []) as unknown as RawLancRow[]
    for (const r of recebidas) linhas.push(mapearLancamento(r))
    if (recebidas.length === 0 || linhas.length >= total) break
  }

  return { linhas, total }
}

// Último lançamento do operador (para "repetir último" — pré-preenche tudo menos
// a quantidade). Ignora os estornos (o inverso não faz sentido repetir).
export async function getUltimoLancamento(userId: string): Promise<UltimoLancamento | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lancamentos_item')
    .select('item_id, filial_id, tipo, chamado, colaborador')
    .eq('criado_por', userId)
    .is('estorna_id', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as UltimoLancamento | null) ?? null
}
