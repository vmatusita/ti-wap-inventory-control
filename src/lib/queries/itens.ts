import { createClient } from '@/lib/supabase/server'
import { hojeISO } from '@/lib/format'
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
  saldo: number
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
    saldo: Number(r.saldo),
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

// Histórico paginado (mais recente primeiro), com sinalização de estorno.
export async function getHistoricoLancamentos(opts: {
  filialId?: number | null
  itemId?: number | null
  page?: number
  pageSize?: number
}): Promise<{ rows: LancamentoHistorico[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = opts.pageSize ?? 20
  const from = (page - 1) * pageSize

  let q = supabase
    .from('lancamentos_item')
    .select(LANC_SELECT, { count: 'exact' })
  if (opts.filialId) q = q.eq('filial_id', opts.filialId)
  if (opts.itemId) q = q.eq('item_id', opts.itemId)
  q = q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1)

  const { data, error, count } = await q
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
      estornado: estornadas.has(r.id),
      created_at: r.created_at,
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
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
