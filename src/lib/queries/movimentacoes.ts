import { createClient } from '@/lib/supabase/server'
import type {
  CategoriaAtivo,
  StatusAtivo,
  TermoStatus,
  TipoMovimentacao,
} from '@/lib/dominio'
import { canonicalizarPatrimonio, patrimoniosRepetidos } from '@/lib/patrimonio'
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

// ---------------------------------------------------------------------------
// F11/M8 — LISTA de movimentações (`/movimentacoes`).
//
// Até aqui o ÚNICO histórico do sistema era a linha do tempo POR ATIVO: não
// existia tela que respondesse "o que foi registrado hoje?". Esta query é a
// leitura dessa tela — 100% server-side (filtros na URL, paginação por `range`).
// ---------------------------------------------------------------------------

// Página da lista. 30 cabe numa tela sem virar rolagem infinita e mantém a 2ª
// consulta de estorno (`.in`) com uma URL curta.
export const MOV_PAGE_SIZE = 30

// Teto defensivo: `pageSize` vem de quem chama, não da URL, mas um valor absurdo
// aqui viraria um `range` gigante no PostgREST.
const MOV_PAGE_SIZE_MAX = 100

export type MovimentacaoLista = {
  id: string
  tipo: TipoMovimentacao
  data: string
  created_at: string
  colaborador: string | null
  setor: string | null
  observacao: string | null
  ativo_id: string
  // null = ativo sem patrimônio físico (import F7E) — a UI mostra "sem patrimônio".
  patrimonio: string | null
  service_tag: string | null
  // Este patrimônio pertence a MAIS DE UM ativo entre as linhas desta página
  // (duplicidade legítima da spec §5): a tabela mostra a service tag p/ desempatar.
  patrimonio_duplicado: boolean
  categoria: CategoriaAtivo | null
  marca: string | null
  modelo: string | null
  filial_nome: string | null
  autor_nome: string | null
  // `tipo === 'estorno'`: esta linha DESFEZ outra.
  ehEstorno: boolean
  // Alguma outra movimentação aponta para esta em `estorno_de` (2ª consulta).
  estornada: boolean
}

export type ListarMovimentacoesParams = {
  de?: string
  ate?: string
  tipo?: TipoMovimentacao
  filialId?: number
  q?: string
  page?: number
  pageSize?: number
}

export type ListarMovimentacoesResult = {
  rows: MovimentacaoLista[]
  total: number
  page: number
  pageSize: number
}

// Como o termo de busca foi interpretado (a UI explica ao operador em qual campo
// procurou). UM CAMPO SÓ — o PostgREST não faz `OR` entre a tabela e um embed.
export type BuscaMovimentacao =
  | {
      campo: 'patrimonio'
      /** O que a legenda mostra: a forma canônica quando o termo canoniza,
       *  senão o termo exatamente como o operador digitou (em maiúsculas). */
      valor: string
      /** Forma canônica para o `.eq` — `null` quando o termo não canoniza. */
      canonico: string | null
      /** Termo em maiúsculas e sem espaços, para o `.ilike` (que ignora caixa):
       *  o acervo tem patrimônio gravado fora do padrão, inclusive em
       *  minúsculas. Mesma doutrina de `resolverPatrimoniosParaLote` (F10). */
      cru: string
    }
  | { campo: 'colaborador'; valor: string }
  | null

// Neutraliza os curingas do ILIKE (`%`, `_` e o `*` que o PostgREST traduz para
// `%`) e o que quebra o parser da querystring — mesma defesa de `prefixoSeguro`.
// Aqui os caracteres viram ESPAÇO (não somem): "Fulano%Silva" precisa continuar
// achando "Fulano Silva"; remover colaria as palavras e não casaria nada.
function termoIlikeSeguro(termo: string): string {
  return termo.replace(/[%_*(),\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

// FORMA de um patrimônio gravado fora do padrão canônico. A F7J deixou entrar
// valores como o fictício `LEA7LYHQH4`, que `canonicalizarPatrimonio` NÃO
// canoniza — e que, até a F12, caíam no ramo colaborador e devolviam zero linhas
// com uma legenda mandando o operador "digitar o patrimônio por inteiro", que é
// exatamente o que ele acabara de fazer (achado F12-W4-02).
//
// Critério: UMA palavra só (sem espaço), alfanumérica com hífen, ao menos 4
// caracteres e com ao menos UM DÍGITO — nome de colaborador não tem essa forma.
// A restrição de charset também é a defesa: nada aqui é metacaractere do
// PostgREST (`,` `(` `)` `.` `%` `_` `*`), então o valor entra no `.or()` sem
// escape possível.
//
// LIMITE CONHECIDO E ACEITO: patrimônio não-canônico SEM nenhum dígito é
// indistinguível de um nome de pessoa e continua no ramo colaborador. Medido no
// ensaio (cópia do acervo, 23/07/2026): dos 89 patrimônios não-canônicos, 52
// entram por aqui; os 37 restantes são um único valor-sentinela repetido, não
// uma plaqueta que alguém procure.
const FORMA_PATRIMONIO_CRU = /^[A-Za-z0-9-]{4,}$/

// Decisão do Johnny (F11): a busca da lista é de CAMPO ÚNICO.
//  - Se o texto canonicaliza como patrimônio ("wap 4491" → WAP0004491), procura
//    no patrimônio do ativo (embed `!inner`) pelas DUAS formas — canônica e crua.
//  - Se tem a FORMA de um patrimônio fora do padrão, procura pela forma crua.
//  - Senão, procura por trecho no colaborador da própria movimentação.
// Pura — testada em `movimentacoes.test.ts`.
export function interpretarBuscaMovimentacao(
  q: string | null | undefined,
): BuscaMovimentacao {
  const termo = (q ?? '').trim()
  if (!termo) return null
  // Espaço só é removido para o `.ilike`: o operador cola "wap 4491" e o banco
  // guarda "WAP4491". Para DECIDIR o ramo vale o termo original — senão
  // "Ana 12" viraria "ANA12" e seria lido como patrimônio.
  const cru = termo.toUpperCase().replace(/\s+/g, '')
  const canonico = canonicalizarPatrimonio(termo)
  if (canonico) return { campo: 'patrimonio', valor: canonico, canonico, cru }
  if (FORMA_PATRIMONIO_CRU.test(termo) && /\d/.test(termo)) {
    return { campo: 'patrimonio', valor: cru, canonico: null, cru }
  }
  const limpo = termoIlikeSeguro(termo)
  // Sobrou só curinga (o operador digitou "%%%"): sem filtro, e não uma busca
  // por `%%` — que esconderia em silêncio toda linha sem colaborador.
  if (!limpo) return null
  return { campo: 'colaborador', valor: limpo }
}

// Patrimônio repete em casos raros — a chave é o PAR patrimônio + service tag
// (spec §5). Buscar `WAP0001234` aqui traz o histórico dos DOIS ativos
// intercalado por data, e sem desempate a lista se lê como a linha do tempo de
// UMA máquina. Conta por ATIVO DISTINTO: a mesma máquina aparece em várias
// linhas do histórico e isso não é duplicidade. Escopo = a página, como em
// `listarAtivos`. Pura — testada em `movimentacoes.test.ts`.
export function patrimoniosAmbiguosNaPagina(
  linhas: { ativo_id: string; patrimonio: string | null }[],
): Set<string> {
  const porAtivo = new Map<string, string>()
  for (const l of linhas) {
    if (l.patrimonio && !porAtivo.has(l.ativo_id))
      porAtivo.set(l.ativo_id, l.patrimonio)
  }
  return patrimoniosRepetidos([...porAtivo.values()])
}

type RawListaRow = {
  id: string
  tipo: TipoMovimentacao
  data: string
  created_at: string
  colaborador: string | null
  setor: string | null
  observacao: string | null
  ativo_id: string
  ativos: {
    patrimonio: string | null
    service_tag: string | null
    categoria: CategoriaAtivo
    marca: string | null
    modelo: string | null
  } | null
  autor: AutorEmbed
  filial: FilialEmbed
}

const LISTA_COLUNAS =
  'id, tipo, data, created_at, colaborador, setor, observacao, ativo_id'

// `!inner` transforma o embed do ativo em INNER JOIN. É PRECISO quando há filtro
// por patrimônio: sem ele o embed é LEFT JOIN e o `.eq('ativos.patrimonio', …)`
// apenas ZERA o objeto embutido — as linhas continuam todas na resposta. Medido
// no Supabase de DEV (22/07/2026): com `!inner`, count = 5; sem `!inner`, mesmo
// filtro, count = 3.066 (= a base inteira). Primeiro uso de `!inner` no projeto.
// Sem filtro, mantemos o LEFT JOIN (nenhuma movimentação some por causa do join).
function listaSelect(inner: boolean): string {
  return (
    `${LISTA_COLUNAS}, ` +
    `ativos${inner ? '!inner' : ''}(patrimonio, service_tag, categoria, marca, modelo), ` +
    'autor:profiles!movimentacoes_criado_por_fkey(nome), ' +
    'filial:filiais!movimentacoes_filial_id_fkey(nome)'
  )
}

// Query base (select + filtros + ordem, SEM faixa). Devolve uma query NOVA a
// cada chamada: o builder do postgrest-js é mutável e não se reexecuta com
// segurança (mesma nota de `queryHistorico` em queries/itens.ts).
//
// O período (`de`/`ate`) é sobre a coluna `data` — a MESMA exibida na tabela —,
// pela mesma razão do histórico de itens: filtrar por `created_at` divergiria do
// que o operador vê (uma movimentação de ontem registrada hoje). A ordem segue
// `data` primeiro, para a coluna visível não aparecer fora de sequência;
// `created_at` e `id` desempatam e deixam a paginação determinística (conferido
// no DEV: zero linhas repetidas entre a página 1 e a 2).
function queryLista(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: ListarMovimentacoesParams,
  busca: BuscaMovimentacao,
  head = false,
) {
  let q = supabase
    .from('movimentacoes')
    .select(listaSelect(busca?.campo === 'patrimonio'), {
      count: 'exact',
      head,
    })

  if (params.de) q = q.gte('data', params.de)
  if (params.ate) q = q.lte('data', params.ate)
  if (params.tipo) q = q.eq('tipo', params.tipo)
  // Filial DE ORIGEM (a coluna `filial_id` da movimentação). Numa transferência,
  // a linha aparece no filtro da origem — é onde o evento foi registrado.
  if (params.filialId) q = q.eq('filial_id', params.filialId)
  if (busca?.campo === 'patrimonio') {
    // DUAS formas, como `resolverPatrimoniosParaLote` (F10) já fazia no colar-
    // lista: `.eq` na canônica e `.ilike` (sem curinga = igualdade que ignora a
    // caixa) na crua. Só o `.eq` deixava 29 ativos de patrimônio não-canônico
    // inalcançáveis por esta tela (F12-W4-02). `referencedTable` põe o filtro
    // sobre o embed — que é `!inner` justamente por causa deste filtro.
    const formas = busca.canonico
      ? `patrimonio.eq.${busca.canonico},patrimonio.ilike.${busca.cru}`
      : `patrimonio.ilike.${busca.cru}`
    q = q.or(formas, { referencedTable: 'ativos' })
  } else if (busca?.campo === 'colaborador') {
    q = q.ilike('colaborador', `%${busca.valor}%`)
  }

  return q
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
}

// Faixa pedida além do fim do resultado. O PostgREST responde 416 com este
// código em vez de uma lista vazia (conferido no DEV: `?page=3000` num acervo de
// ~3 mil linhas).
const RANGE_INVALIDO = 'PGRST103'

// Lista paginada, da mais recente para a mais antiga.
export async function listarMovimentacoes(
  params: ListarMovimentacoesParams,
): Promise<ListarMovimentacoesResult> {
  const supabase = await createClient()
  const pageSize = Math.min(
    MOV_PAGE_SIZE_MAX,
    Math.max(1, params.pageSize ?? MOV_PAGE_SIZE),
  )
  const busca = interpretarBuscaMovimentacao(params.q)
  const faixa = (p: number) =>
    queryLista(supabase, params, busca).range(
      (p - 1) * pageSize,
      (p - 1) * pageSize + pageSize - 1,
    )

  let page = Math.max(1, params.page ?? 1)
  let { data, error, count } = await faixa(page)

  // `?page=3000` (link velho, filtro que encolheu o resultado, digitação) não
  // pode derrubar o Server Component: descobrimos o total e mostramos a ÚLTIMA
  // página que existe. Uma tentativa só — sem laço.
  if (error?.code === RANGE_INVALIDO) {
    const { count: total, error: erroTotal } = await queryLista(
      supabase,
      params,
      busca,
      true,
    )
    if (erroTotal)
      throw new Error(`Falha ao listar movimentações: ${erroTotal.message}`)
    page = Math.max(1, Math.ceil((total ?? 0) / pageSize))
    ;({ data, error, count } = await faixa(page))
  }

  if (error)
    throw new Error(`Falha ao listar movimentações: ${error.message}`)

  const rows = (data ?? []) as unknown as RawListaRow[]

  // 2ª consulta FIXA (nunca N+1) — espelha `getHistoricoLancamentos`: quais
  // destas linhas já foram estornadas? Não existe coluna `estornada`; o estorno é
  // OUTRA movimentação apontando a original em `estorno_de`.
  const ids = rows.map((r) => r.id)
  const estornadas = new Set<string>()
  if (ids.length) {
    const { data: estornos } = await supabase
      .from('movimentacoes')
      .select('estorno_de')
      .in('estorno_de', ids)
    for (const e of estornos ?? []) if (e.estorno_de) estornadas.add(e.estorno_de)
  }

  // Sem consulta extra: os patrimônios da página já vieram no embed.
  const ambiguos = patrimoniosAmbiguosNaPagina(
    rows.map((r) => ({
      ativo_id: r.ativo_id,
      patrimonio: r.ativos?.patrimonio ?? null,
    })),
  )

  return {
    rows: rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      data: r.data,
      created_at: r.created_at,
      colaborador: r.colaborador,
      setor: r.setor,
      observacao: r.observacao,
      ativo_id: r.ativo_id,
      patrimonio: r.ativos?.patrimonio ?? null,
      service_tag: r.ativos?.service_tag ?? null,
      patrimonio_duplicado: r.ativos?.patrimonio
        ? ambiguos.has(r.ativos.patrimonio)
        : false,
      categoria: r.ativos?.categoria ?? null,
      marca: r.ativos?.marca ?? null,
      modelo: r.ativos?.modelo ?? null,
      filial_nome: r.filial?.nome ?? null,
      autor_nome: r.autor?.nome ?? null,
      ehEstorno: r.tipo === 'estorno',
      estornada: estornadas.has(r.id),
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
}
