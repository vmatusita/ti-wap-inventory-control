import { createClient } from '@/lib/supabase/server'
import type {
  StatusAtivo,
  TermoStatus,
  TipoMovimentacao,
} from '@/lib/dominio'
import {
  patrimoniosDuplicados,
  RESUMO_SELECT,
  resumoDe,
  type AtivoResumo,
  type RawAtivoResumo,
} from '@/lib/queries/ativos'

// Estado do ativo ANTES da movimentacao (usado no dialog de estorno — o ativo
// volta a este estado). Gravado pelo trigger em `snapshot_anterior` (jsonb).
export type SnapshotAnterior = {
  status: StatusAtivo | null
  colaborador: string | null
  setor: string | null
  filial_id: number | null
}

// Uma linha da LINHA DO TEMPO da ficha (OS-F2 3.2.3), mais recente no topo.
export type MovimentacaoTimeline = {
  id: string
  tipo: TipoMovimentacao
  motivo: string | null
  data: string
  colaborador: string | null
  setor: string | null
  chamado: string | null
  status_anterior: StatusAtivo | null
  status_resultante: StatusAtivo | null
  itens_faltantes: string[] | null
  observacao: string | null
  estorno_de: string | null
  snapshot_anterior: SnapshotAnterior | null
  created_at: string
  autor_nome: string | null
  filial_origem_nome: string | null
  filial_destino_nome: string | null
}

type AutorEmbed = { nome: string | null } | null
type FilialEmbed = { nome: string } | null

// O select usa hints de FK (`!fkname`) e aliases de embed; o type-checker do
// supabase-js nao infere esse formato, entao tipamos a linha crua e fazemos o
// cast explicito. Os nomes de coluna sao verificados em runtime pelo banco.
type RawTimelineRow = {
  id: string
  tipo: MovimentacaoTimeline['tipo']
  motivo: string | null
  data: string
  colaborador: string | null
  setor: string | null
  chamado: string | null
  status_anterior: StatusAtivo | null
  status_resultante: StatusAtivo | null
  itens_faltantes: string[] | null
  observacao: string | null
  estorno_de: string | null
  snapshot_anterior: SnapshotAnterior | null
  created_at: string
  autor: AutorEmbed
  origem: FilialEmbed
  destino: FilialEmbed
}

const TIMELINE_SELECT =
  'id, tipo, motivo, data, colaborador, setor, chamado, status_anterior, status_resultante, itens_faltantes, observacao, estorno_de, snapshot_anterior, created_at, ' +
  'autor:profiles!movimentacoes_criado_por_fkey(nome), ' +
  'origem:filiais!movimentacoes_filial_id_fkey(nome), ' +
  'destino:filiais!movimentacoes_filial_destino_id_fkey(nome)'

// Linha do tempo do ativo. Ordenada por created_at desc (empate: pela data).
// created_at e monotonico por ativo em producao (cada mov e uma transacao).
export async function listarMovimentacoesDoAtivo(
  ativoId: string,
): Promise<MovimentacaoTimeline[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(TIMELINE_SELECT)
    .eq('ativo_id', ativoId)
    .order('created_at', { ascending: false })
    .order('data', { ascending: false })

  if (error)
    throw new Error(`Falha ao carregar a linha do tempo: ${error.message}`)

  const rows = (data ?? []) as unknown as RawTimelineRow[]
  return rows.map((r) => {
    const autor = r.autor
    const origem = r.origem
    const destino = r.destino
    return {
      id: r.id,
      tipo: r.tipo,
      motivo: r.motivo,
      data: r.data,
      colaborador: r.colaborador,
      setor: r.setor,
      chamado: r.chamado,
      status_anterior: r.status_anterior,
      status_resultante: r.status_resultante,
      itens_faltantes: r.itens_faltantes,
      observacao: r.observacao,
      estorno_de: r.estorno_de,
      snapshot_anterior: (r.snapshot_anterior as SnapshotAnterior | null) ?? null,
      created_at: r.created_at,
      autor_nome: autor?.nome ?? null,
      filial_origem_nome: origem?.nome ?? null,
      filial_destino_nome: destino?.nome ?? null,
    }
  })
}

// "Repetir ultima" (OS-F2 3.7.3): pre-preenche tipo/motivo/colaborador/setor/
// chamado/termo da ultima movimentacao registrada pelo usuario logado (menos o
// ativo). Estorno e compra NAO entram — o wizard nao oferece nenhum dos dois
// (compra tem tela propria, /ativos/novo), entao repetir um deles so limparia os
// campos ja digitados sem preencher nada util.
export type UltimaMovimentacaoUsuario = {
  tipo: TipoMovimentacao
  motivo: string | null
  colaborador: string | null
  setor: string | null
  chamado: string | null
  termo_assinado: TermoStatus | null
  termo_data: string | null
}

export async function ultimaMovimentacaoDoUsuario(
  userId: string,
): Promise<UltimaMovimentacaoUsuario | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select('tipo, motivo, colaborador, setor, chamado, termo_assinado, termo_data')
    .eq('criado_por', userId)
    .neq('tipo', 'estorno')
    .neq('tipo', 'compra')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return (data as UltimaMovimentacaoUsuario | null) ?? null
}

// "Duplicar" (OS-F2 3.7.4): abre /movimentacoes/nova pre-preenchida com aquela
// movimentacao (permitindo trocar o ativo).
export type MovimentacaoParaDuplicar = {
  ativo_id: string
  tipo: TipoMovimentacao
  motivo: string | null
  colaborador: string | null
  setor: string | null
  chamado: string | null
  termo_assinado: TermoStatus | null
  termo_data: string | null
  observacao: string | null
  filial_destino_id: number | null
  itens_faltantes: string[] | null
}

export async function buscarMovimentacaoParaDuplicar(
  id: string,
): Promise<MovimentacaoParaDuplicar | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(
      'ativo_id, tipo, motivo, colaborador, setor, chamado, termo_assinado, termo_data, observacao, filial_destino_id, itens_faltantes',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao carregar movimentação: ${error.message}`)
  return (data as MovimentacaoParaDuplicar | null) ?? null
}

// ---------------------------------------------------------------------------
// F10/M3 — "Movimentados recentemente" no combobox do fluxo de movimentação.
// Com menos de 2 caracteres o combobox só dizia "Digite ao menos 2 caracteres";
// agora oferece os ativos que ESTE operador acabou de mexer (o caso real:
// devolver hoje o notebook que saiu ontem).
// ---------------------------------------------------------------------------

// Quantas movimentações varrer antes de deduplicar por ativo. Um operador que
// mexeu 5× no mesmo ativo ainda deixa sugestões variadas na lista.
const JANELA_RECENTES = 30

// Exclui `compra` e `estorno` pelo mesmo motivo de `ultimaMovimentacaoDoUsuario`:
// o wizard não oferece nenhum dos dois. Dedup POR ATIVO em código — o PostgREST
// não tem DISTINCT ON.
export async function ultimosAtivosMovimentadosDoOperador(
  operadorId: string,
  limite = 8,
): Promise<AtivoResumo[]> {
  if (!operadorId || limite <= 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(`ativo_id, ativos(${RESUMO_SELECT})`)
    .eq('criado_por', operadorId)
    .neq('tipo', 'estorno')
    .neq('tipo', 'compra')
    .order('created_at', { ascending: false })
    .limit(JANELA_RECENTES)

  if (error)
    throw new Error(`Falha ao carregar movimentações recentes: ${error.message}`)

  type Row = { ativo_id: string; ativos: RawAtivoResumo | null }
  const vistos = new Set<string>()
  const rows: RawAtivoResumo[] = []
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.ativos || vistos.has(r.ativo_id)) continue
    vistos.add(r.ativo_id)
    rows.push(r.ativos)
    if (rows.length >= limite) break
  }
  if (rows.length === 0) return []

  const dups = await patrimoniosDuplicados(
    supabase,
    rows.map((r) => r.patrimonio).filter((p): p is string => p !== null),
  )
  return rows.map((r) =>
    resumoDe(r, r.patrimonio !== null && dups.has(r.patrimonio)),
  )
}

// ---------------------------------------------------------------------------
// F10/M4 — sugestões de colaborador e setor a partir do próprio histórico.
// Colaborador e setor são texto livre redigitado a cada movimentação, e as
// grafias divergem ("Fulano da Silva" × "fulano silva") — o mesmo problema que
// a spec §5 combate para os motivos. Sugerir ≠ obrigar: a UI segue aceitando
// texto novo, e NADA é normalizado retroativamente (decisão §2 da OS-F10).
// ---------------------------------------------------------------------------

// Teto de linhas varridas por consulta. O PostgREST não tem DISTINCT: a coluna
// vem repetida e o dedup é em código. Medido em DEV: o prefixo de 2 letras mais
// populoso do histórico devolve ~90 linhas — 500 é folga larga.
const LINHAS_SUGESTAO = 500
const MAX_SUGESTOES = 10

// Prefixo mínimo. O proxy de action repete a guarda: 1 letra varreria a base
// inteira à toa.
const MIN_PREFIXO_SUGESTAO = 2

// Neutraliza os curingas do LIKE/ILIKE do PostgREST (`%`, `_` e o `*` que ele
// traduz para `%`) e o que quebra o parser da querystring. Sem isso, digitar
// "%" listaria o histórico inteiro.
function prefixoSeguro(prefixo: string): string {
  return prefixo.trim().replace(/[%_*(),\\]/g, '')
}

async function sugestoesDeColuna(
  coluna: 'colaborador' | 'setor',
  prefixo: string,
): Promise<string[]> {
  const termo = prefixoSeguro(prefixo)
  if (termo.length < MIN_PREFIXO_SUGESTAO) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(coluna)
    .not(coluna, 'is', null)
    .ilike(coluna, `${termo}%`)
    .limit(LINHAS_SUGESTAO)

  if (error) throw new Error(`Falha ao carregar sugestões: ${error.message}`)

  // Dedup case-insensitive preservando a 1ª grafia vista; ordem alfabética
  // (pt-BR, para acento não jogar tudo para o fim).
  const porChave = new Map<string, string>()
  for (const linha of (data ?? []) as Record<string, string | null>[]) {
    const valor = linha[coluna]?.trim()
    if (!valor) continue
    const chave = valor.toLocaleLowerCase('pt-BR')
    if (!porChave.has(chave)) porChave.set(chave, valor)
  }
  return [...porChave.values()]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .slice(0, MAX_SUGESTOES)
}

export async function sugestoesColaboradores(prefixo: string): Promise<string[]> {
  return sugestoesDeColuna('colaborador', prefixo)
}

export async function sugestoesSetores(prefixo: string): Promise<string[]> {
  return sugestoesDeColuna('setor', prefixo)
}

// ---------------------------------------------------------------------------
// F10/M5 — regra 7 da spec §8: "alerta de possível duplicata — mesmo ativo +
// mesmo tipo + mesmo dia" (6 casos reais nas planilhas de origem). É AVISO, não
// trava: `registrarMovimentacoes` fica intacto e o registro segue permitido.
//
// "Efetiva" = não estornada. NÃO existe coluna `estornada`: o estorno é OUTRA
// movimentação, com `tipo='estorno'` e `estorno_de = <id da original>`. Daí as
// DUAS consultas (número fixo — nunca N+1): candidatas, depois quem as estorna.
// ---------------------------------------------------------------------------
export type ParMovimentacaoDia = {
  ativoId: string
  tipo: TipoMovimentacao
  data: string
}

export type PossivelDuplicataDia = {
  ativoId: string
  patrimonio: string | null
  tipo: TipoMovimentacao
}

export async function possiveisDuplicatasDoDia(
  pares: ParMovimentacaoDia[],
): Promise<PossivelDuplicataDia[]> {
  if (pares.length === 0) return []
  const ativoIds = [...new Set(pares.map((p) => p.ativoId))]
  const tipos = [...new Set(pares.map((p) => p.tipo))]
  const datas = [...new Set(pares.map((p) => p.data))]

  const supabase = await createClient()
  // Produto cartesiano dos 3 `in` — superconjunto barato (índice mov_ativo_idx
  // cobre ativo_id + data); o casamento exato da TRINCA é feito em código.
  const { data, error } = await supabase
    .from('movimentacoes')
    .select('id, ativo_id, tipo, data, ativos(patrimonio)')
    .in('ativo_id', ativoIds)
    .in('tipo', tipos)
    .in('data', datas)

  if (error)
    throw new Error(`Falha ao checar duplicatas do dia: ${error.message}`)

  type Row = {
    id: string
    ativo_id: string
    tipo: TipoMovimentacao
    data: string
    ativos: { patrimonio: string | null } | null
  }
  const chaveDoPar = (p: { ativoId: string; tipo: string; data: string }) =>
    `${p.ativoId}|${p.tipo}|${p.data}`
  const pedidas = new Set(pares.map(chaveDoPar))

  const candidatas = ((data ?? []) as unknown as Row[]).filter((r) =>
    pedidas.has(chaveDoPar({ ativoId: r.ativo_id, tipo: r.tipo, data: r.data })),
  )
  if (candidatas.length === 0) return []

  // 2ª consulta (padrão de `getHistoricoLancamentos`): quais candidatas já foram
  // estornadas? Uma movimentação estornada NÃO conta como duplicata.
  const estornadas = new Set<string>()
  const { data: estornos } = await supabase
    .from('movimentacoes')
    .select('estorno_de')
    .in(
      'estorno_de',
      candidatas.map((c) => c.id),
    )
  for (const e of estornos ?? []) if (e.estorno_de) estornadas.add(e.estorno_de)

  // Uma linha por (ativo, tipo) — 2 saídas no mesmo dia geram 1 aviso só.
  const porChave = new Map<string, PossivelDuplicataDia>()
  for (const c of candidatas) {
    if (estornadas.has(c.id)) continue
    const chave = `${c.ativo_id}|${c.tipo}`
    if (porChave.has(chave)) continue
    porChave.set(chave, {
      ativoId: c.ativo_id,
      patrimonio: c.ativos?.patrimonio ?? null,
      tipo: c.tipo,
    })
  }
  return [...porChave.values()]
}
