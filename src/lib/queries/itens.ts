import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { registrarFalha } from '@/lib/observabilidade'
import { hojeISO } from '@/lib/format'
import { BLOCO_EXPORT, CAP_EXPORT, MAX_BLOCOS_EXPORT } from '@/lib/csv'
import { listarFiliais, type Filial } from '@/lib/queries/filiais'
import { filiaisDoConsolidado } from '@/lib/queries/relatorios/recorte-filiais'
import { lerSaldoItensEmNiveis } from '@/lib/queries/relatorios/itens'
import type { GrupoItem, TipoLancamento } from '@/lib/dominio'
import { chamarRpc } from '@/lib/supabase/rpc'
import { lerUnidades, type UnidadesEfetivas } from '@/lib/auth/recorte-leitura'
import { recortarPorUnidade } from '@/lib/queries/recorte-consulta'
import type { LancamentoParaSaldoApos } from '@/lib/itens/saldo-apos'
import type { LancamentoDeAcessorio, TipoDeAcessorio } from '@/lib/termos/acessorios'
import type { SaldoDaPessoa } from '@/lib/itens/vinculo-retorno'
import { linhaOuFalha, linhasDe, linhasOuFalha } from '@/lib/supabase/linhas'
import {
  LEITURA_ACESSORIOS_DAS_MOVIMENTACOES,
  LEITURA_HISTORICO_LANCAMENTOS,
  LEITURA_HISTORICO_PARA_EXPORT,
  LEITURA_ITENS_ADMIN,
  LEITURA_ITENS_ATIVOS,
  LEITURA_ITENS_JUNTO_DO_ATIVO,
  LEITURA_LANCAMENTOS_SALDO_APOS,
  LEITURA_SALDO_COLABORADOR,
  LEITURA_ULTIMO_LANCAMENTO,
} from '@/lib/queries/formas/itens'

// Leituras da operação de itens por quantidade (F3B / OS 3.3.4). Rota só do
// operador (o visualizador por senha não acessa /itens) — usam o client do
// servidor com a sessão do operador (RLS authenticated). As agregações do
// RELATÓRIO (grupos 2–3) vivem em src/lib/queries/relatorios.ts (recebem o
// client resolvido, pois servem também a sessão por senha).

// `estoque_minimo` (F12 · I5) viaja no catálogo — e não no saldo — de propósito:
// é dado do ITEM, não do recorte de filial/data. Quem alerta é `precisaRepor`
// (validators/item.ts), cruzando este número com o estoque CONSOLIDADO da RPC.
export type ItemCatalogo = {
  id: number
  nome: string
  grupo: GrupoItem
  estoque_minimo: number
  // F42 — o tipo do item (F37/D7), ANULÁVEL: o catálogo existente nasceu sem tipo
  // e ninguém é obrigado a preencher. A tabela de `/itens` ganhou a coluna "Tipo"
  // e a lê daqui, cruzando com `listarTiposItem()` — o mesmo par que `/admin/itens`
  // já usa. Campo ADITIVO: quem só lia `id`/`nome`/`grupo` (os dois diálogos, o
  // combobox, os filtros do histórico) não muda uma linha.
  tipo_id: number | null
}

export type ItemAdmin = {
  id: number
  nome: string
  grupo: GrupoItem
  ordem: number
  ativo: boolean
  estoque_minimo: number
  lancamentos: number
  // F37/D7 — o tipo do item, ANULÁVEL: o catálogo existente nasceu sem tipo e
  // ninguém é obrigado a preencher. `admin/itens` mostra a coluna com um selo nos
  // sem tipo, e a F39 vai usar o tipo para dizer "um carregador" no termo em vez do
  // nome comercial do produto.
  tipo_id: number | null
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
  // ITN-02 — quem REGISTROU o lançamento (autor, `criado_por`) — não confundir
  // com `colaborador`, que é digitado à mão e diz a quem o item se destina.
  autor_nome: string | null
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
    .select(LEITURA_ITENS_ATIVOS.select)
    .eq('ativo', true)
    .order('grupo', { ascending: true })
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar itens: ${error.message}`)
  return linhasDe(data, LEITURA_ITENS_ATIVOS.forma, LEITURA_ITENS_ATIVOS.rotulo)
}

// Catálogo completo + contagem de lançamentos (admin decide desativar × excluir).
export async function listarItensAdmin(): Promise<ItemAdmin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('itens')
    .select(LEITURA_ITENS_ADMIN.select)
    .order('grupo', { ascending: true })
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar itens: ${error.message}`)
  return linhasDe(data, LEITURA_ITENS_ADMIN.forma, LEITURA_ITENS_ADMIN.rotulo).map((r) => ({
    id: r.id,
    nome: r.nome,
    grupo: r.grupo,
    ordem: r.ordem,
    ativo: r.ativo,
    estoque_minimo: r.estoque_minimo,
    tipo_id: r.tipo_id,
    lancamentos: r.lancamentos_item?.[0]?.count ?? 0,
  }))
}

// ---------------------------------------------------------------------------
// O SALDO EM DOIS NÍVEIS (F60 · lote 2 · PLAN-F60 §6.4)
// ---------------------------------------------------------------------------
// `rel_saldo_itens_filiais` (0143) devolve, NUMA chamada, uma linha por (filial do recorte, item) e
// o NÍVEL DO TOTAL do recorte (`filial_id` NULL), com os mesmos clamps do corpo antigo aplicados ao
// CONJUNTO. Até a F59 isto eram 1 + N chamadas de `rel_saldo_itens` por render de `/itens` (uma
// consolidada, com o recorte nulo, e uma por filial ativa — 7 com as seis filiais de hoje).
//
// ⚠ O TOTAL NÃO É A SOMA DAS LINHAS POR FILIAL, e é por isso que ele vem do banco. Os clamps não são
// aditivos quando um chamado atravessa filiais: reserva de 5 no chamado X na filial A e liberação
// de 5 do mesmo chamado na B dão 5 atrelados somando as filiais, e 0 no total. Quem precisa do
// número do recorte INTEIRO lê o nível do total; quem precisa de colunas lê as linhas por filial.

/** Uma linha de `rel_saldo_itens_filiais`: o NÍVEL é `filial_id` — o id nas linhas por filial, `null` no total. */
export type SaldoItemNivel = SaldoItem & { filial_id: number | null }

/** Os dois níveis de UMA chamada, separados. */
export type NiveisDeSaldo = {
  /** O nível do total do recorte (as linhas `filial_id` NULL), na ordem da RPC. */
  total: SaldoItem[]
  /** As linhas de cada filial do recorte, na ordem da RPC, por `filial_id`. */
  porFilial: ReadonlyMap<number, SaldoItem[]>
}

function semNivel(s: SaldoItemNivel): SaldoItem {
  return {
    item_id: s.item_id,
    item: s.item,
    grupo: s.grupo,
    ordem: s.ordem,
    total: s.total,
    estoque: s.estoque,
    atrelados: s.atrelados,
    falta: s.falta,
  }
}

/** Separa as linhas de uma chamada pelo nível, preservando a ordem da RPC dentro de cada um. Pura. */
export function separarNiveisDeSaldo(linhas: readonly SaldoItemNivel[]): NiveisDeSaldo {
  const total: SaldoItem[] = []
  const porFilial = new Map<number, SaldoItem[]>()
  for (const l of linhas) {
    if (l.filial_id === null) {
      total.push(semNivel(l))
      continue
    }
    const lista = porFilial.get(l.filial_id) ?? []
    lista.push(semNivel(l))
    porFilial.set(l.filial_id, lista)
  }
  return { total, porFilial }
}

/**
 * Os saldos de uma MULTI-SELEÇÃO de filiais a partir de UMA chamada com a lista: as linhas por
 * filial de cada id pedido, somadas por `somarSaldosDeFiliais` na ordem pedida — o MESMO número de
 * antes, que somava N chamadas de uma filial (e não o nível do total da lista, que difere quando um
 * chamado atravessa filiais). Pura.
 */
export function somarSaldosDaSelecao(
  ids: readonly number[],
  linhas: readonly SaldoItemNivel[],
): SaldoItem[] {
  const { porFilial } = separarNiveisDeSaldo(linhas)
  return somarSaldosDeFiliais(ids.map((id) => porFilial.get(id) ?? []))
}

/**
 * A leitura de `rel_saldo_itens_filiais` (as-of hoje) com a lista dada — os dois níveis juntos.
 *
 * ⚠ `filiais` NUNCA é `null` aqui: o tipo o recusa, e quem chama resolve o "todas" pela lista
 * explícita (`filiaisDoConsolidado`, inclusive desativadas). Lista vazia não vai ao banco: a RPC
 * daria zero linhas de qualquer jeito.
 *
 * ⚠ PAGINADA, por `lerSaldoItensEmNiveis` (`relatorios/itens.ts`) — a única leitura da RPC no app. Até
 * a revisão do lote 2 esta era uma ida só, e a resposta de (filiais + 1) × itens linhas passava do
 * `max-rows` do PostgREST a partir de 143 itens com as seis filiais de hoje: o corte caía, calado, nas
 * colunas das filiais de id mais alto (a coluna zerada, o "fora das colunas" aceso sem filial
 * desativada, a soma da multi-seleção menor). O porquê inteiro está lá.
 */
async function lerSaldosEmNiveis(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filiais: readonly number[],
): Promise<SaldoItemNivel[]> {
  return lerSaldoItensEmNiveis(supabase, filiais, hojeISO())
}

// Saldo/atrelados/falta por item (as-of hoje) do RECORTE `ids` inteiro — o nível do total de UMA
// chamada. Uma filial: `[id]` (o total de uma filial só é a própria linha dela). O consolidado: a
// lista de TODAS as filiais (`filiaisDoConsolidado`), nunca `null` (F60). Chamadores: a conferência,
// o dashboard, `actions/admin.ts` e `actions/itens.ts`.
export async function getSaldosItens(ids: readonly number[]): Promise<SaldoItem[]> {
  const supabase = await createClient()
  return separarNiveisDeSaldo(await lerSaldosEmNiveis(supabase, ids)).total
}

// ---------------------------------------------------------------------------
// F25 — saldos de um SUBCONJUNTO de filiais (filtro multi-seleção)
// ---------------------------------------------------------------------------
// Desde a F60 a multi-seleção é UMA chamada com a lista (`somarSaldosDaSelecao`, acima) — antes, N
// chamadas de uma filial. A soma continua em memória, célula a célula, porque é o número que a tela
// sempre mostrou.
//
// ⚠ Somar `falta` entre filiais é a leitura que esta casa JÁ adota: é o que
// `combinarSaldosPorFilial` faz no ramo do item sem consolidado, e o comentário de
// `estoqueForaDasColunas` registra a mesma soma. Faltar 2 na Serra e 1 em Linhares é faltar 3 nas
// duas — o que a coluna NÃO significa é "falta 3 num lugar só".

/** Junta N leituras por filial numa lista só, somando célula a célula. Pura. */
export function somarSaldosDeFiliais(porFilial: SaldoItem[][]): SaldoItem[] {
  const linhas = new Map<number, SaldoItem>()
  for (const lista of porFilial) {
    for (const s of lista) {
      const atual = linhas.get(s.item_id)
      if (!atual) {
        linhas.set(s.item_id, { ...s })
        continue
      }
      atual.total += s.total
      atual.estoque += s.estoque
      atual.atrelados += s.atrelados
      atual.falta += s.falta
    }
  }
  // A ordem é a da RPC (grupo/ordem/nome), preservada pela ordem de inserção: a
  // primeira leitura já traz TODOS os itens ativos, com zeros onde não há saldo.
  return [...linhas.values()]
}

/**
 * Saldos das unidades efetivas. `todas` = o nível do total com a lista de TODAS as filiais
 * (inclusive desativadas); uma lista = as linhas por filial dela, somadas (`somarSaldosDaSelecao`),
 * numa chamada só. Todo lançamento de item tem filial, então não há saldo "sem unidade" a mostrar:
 * `somente-sem-unidade` e `nenhuma` devolvem a lista vazia de SALDOS (não de filtro), sem ir ao banco.
 */
export async function getSaldosItensDeFiliais(
  unidades: UnidadesEfetivas<'id'>,
): Promise<SaldoItem[]> {
  const vista = lerUnidades(unidades)
  switch (vista.modo) {
    case 'todas': {
      const supabase = await createClient()
      const linhas = await lerSaldosEmNiveis(supabase, await filiaisDoConsolidado(supabase))
      return separarNiveisDeSaldo(linhas).total
    }
    case 'lista': {
      const supabase = await createClient()
      return somarSaldosDaSelecao(vista.valores, await lerSaldosEmNiveis(supabase, vista.valores))
    }
    case 'somente-sem-unidade':
    case 'nenhuma':
      return []
  }
}

// ---------------------------------------------------------------------------
// Saldos das filiais LADO A LADO (F11 · I4)
// ---------------------------------------------------------------------------
// "Onde tem mouse sobrando?" exigia trocar o filtro de filial uma vez por
// filial. Aqui a leitura é FIXA — nunca uma por item. Até a F59, 1 chamada por
// filial + 1 consolidada; desde a F60, UMA chamada de `rel_saldo_itens_filiais`
// com todas as filiais, nos dois níveis (`montarSaldosPorFilial`, abaixo).

// Os quatro números que a RPC devolve para um item numa filial (ou consolidado).
export type CelulaSaldo = {
  total: number
  estoque: number
  atrelados: number
  falta: number
}

export type SaldoItemFiliais = {
  item_id: number
  item: string
  grupo: GrupoItem
  ordem: number
  // Saldo em cada filial, indexado por `filial.id`. Filial sem nenhum lançamento
  // do item não vem na RPC — a tabela mostra zero, não buraco.
  porFilial: Record<number, CelulaSaldo>
  // O NÍVEL DO TOTAL da mesma chamada (todas as filiais, inclusive desativadas): a coluna "Total".
  consolidado: CelulaSaldo
}

export type SaldosPorFilial = {
  filiais: Filial[]
  itens: SaldoItemFiliais[]
}

export const CELULA_SALDO_ZERO: CelulaSaldo = {
  total: 0,
  estoque: 0,
  atrelados: 0,
  falta: 0,
}

function celula(s: SaldoItem): CelulaSaldo {
  return { total: s.total, estoque: s.estoque, atrelados: s.atrelados, falta: s.falta }
}

function somar(a: CelulaSaldo, b: CelulaSaldo): CelulaSaldo {
  return {
    total: a.total + b.total,
    estoque: a.estoque + b.estoque,
    atrelados: a.atrelados + b.atrelados,
    falta: a.falta + b.falta,
  }
}

// Junta as colunas e o consolidado numa linha por item (pura — testada em itens.test.ts).
// A ORDEM e o conjunto de itens saem da leitura consolidada, que é superconjunto
// das por filial: a RPC devolve `i.ativo = true OR tem lançamento no recorte`, e
// "lançamento nesta filial" ⊂ "lançamento em qualquer filial". Item que apareça
// só numa filial (defesa, não deveria acontecer) entra no fim, com o consolidado
// somado das filiais em vez de sumir da tela.
export function combinarSaldosPorFilial(
  filiais: Filial[],
  consolidado: SaldoItem[],
  porFilial: SaldoItem[][],
): SaldoItemFiliais[] {
  const linhas = new Map<number, SaldoItemFiliais>()
  const semConsolidado = new Set<number>()

  for (const s of consolidado) {
    linhas.set(s.item_id, {
      item_id: s.item_id,
      item: s.item,
      grupo: s.grupo,
      ordem: s.ordem,
      porFilial: {},
      consolidado: celula(s),
    })
  }

  filiais.forEach((f, i) => {
    for (const s of porFilial[i] ?? []) {
      let linha = linhas.get(s.item_id)
      if (!linha) {
        linha = {
          item_id: s.item_id,
          item: s.item,
          grupo: s.grupo,
          ordem: s.ordem,
          porFilial: {},
          consolidado: { ...CELULA_SALDO_ZERO },
        }
        linhas.set(s.item_id, linha)
        semConsolidado.add(s.item_id)
      }
      linha.porFilial[f.id] = celula(s)
      if (semConsolidado.has(s.item_id)) {
        linha.consolidado = somar(linha.consolidado, celula(s))
      }
    }
  })

  return [...linhas.values()]
}

// Quanto do estoque do Total NÃO está em nenhuma das colunas da tabela (F11).
// As colunas vêm de `listarFiliais()`, que só devolve filial ATIVA; o Total vem
// do nível do total da mesma chamada, com a lista de TODAS as filiais (F60) — que soma os lançamentos de QUALQUER filial —
// inclusive uma desativada com saldo (o guarda de admin/filiais só conta ativos
// patrimoniados, então isso é alcançável). Como as fórmulas da RPC são aditivas
// por filial (o trigger 0027 garante saldo ≥ 0 em cada uma), a diferença é
// exatamente o estoque que ficou fora das colunas — e a linha deixa de fechar
// sem nada na tela explicando por quê. Zero é o caso normal. Função pura.
export function estoqueForaDasColunas(
  linha: SaldoItemFiliais,
  filiais: Filial[],
): number {
  const soma = filiais.reduce(
    (acc, f) => acc + (linha.porFilial[f.id]?.estoque ?? 0),
    0,
  )
  const fora = linha.consolidado.estoque - soma
  return fora > 0 ? fora : 0
}

/**
 * A tabela lado a lado a partir de UMA chamada com TODAS as filiais: as COLUNAS são as linhas por
 * filial das `filiais` pedidas (as ativas, de `listarFiliais`), e o CONSOLIDADO é o NÍVEL DO TOTAL —
 * que inclui a filial desativada. É esta a emenda que mantém `estoqueForaDasColunas` > 0 exatamente
 * quando há estoque fora das colunas: com o consolidado montado pela soma das colunas, a diferença
 * seria sempre 0 e a tela mentiria calada, com o teste da função pura verde (`itens.test.ts` desfaz a
 * emenda e prova o vermelho). `combinarSaldosPorFilial` e `estoqueForaDasColunas` não mudaram. Pura.
 */
export function montarSaldosPorFilial(
  filiais: Filial[],
  linhas: readonly SaldoItemNivel[],
): SaldoItemFiliais[] {
  const { total, porFilial } = separarNiveisDeSaldo(linhas)
  return combinarSaldosPorFilial(
    filiais,
    total,
    filiais.map((f) => porFilial.get(f.id) ?? []),
  )
}

// Saldo de TODAS as filiais (as-of hoje) + o consolidado, prontos para a tabela
// lado a lado de /itens. `filiaisConhecidas` evita reconsultar a lista quando a
// página já a carregou.
//
// F60 · lote 2 — UMA chamada (antes, 1 + N): a lista de TODAS as filiais, inclusive as desativadas
// (`filiaisDoConsolidado`), e não a de `filiaisConhecidas` — que são as COLUNAS (as ativas). Com a
// lista das ativas o consolidado perderia, em silêncio, o estoque da filial desativada que
// `estoqueForaDasColunas` existe para denunciar.
export async function getSaldosPorFilial(
  filiaisConhecidas?: Filial[],
): Promise<SaldosPorFilial> {
  const supabase = await createClient()
  const [filiais, todas] = await Promise.all([
    filiaisConhecidas ?? listarFiliais(),
    filiaisDoConsolidado(supabase),
  ])
  const linhas = await lerSaldosEmNiveis(supabase, todas)
  return { filiais, itens: montarSaldosPorFilial(filiais, linhas) }
}

// F58: `item_id`/`filial_id`/`criado_por` são not null (migration 0015) → os três embeds saem
// objetos NÃO-nulos — o tipo à mão marcava os três `| null`. O select e a forma moram em
// `queries/formas/itens.ts` (`LEITURA_HISTORICO_LANCAMENTOS`/`LEITURA_HISTORICO_PARA_EXPORT`,
// mesmo `LANC_SELECT`, agora um template só em vez de concatenado por `+`).
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
  item: { nome: string; grupo: GrupoItem }
  filial: { nome: string }
  autor: { nome: string | null }
}

// Filtros do histórico (F9 · I3), sem paginação — compartilhados pela tabela da
// tela e pelo export CSV (F10 · T5), para o arquivo sair com EXATAMENTE as
// linhas do filtro visível.
export type FiltrosHistorico = {
  // F25 — multi-seleção. F57 — `UnidadesEfetivas`, obrigatório: o "sem recorte" é o modo
  // `todas`, com nome, e não um campo esquecido.
  unidades: UnidadesEfetivas<'id'>
  itemId?: number | null
  tipo?: TipoLancamento | null
  de?: string | null
  ate?: string | null
  // ITN-03b — busca por CHAMADO ou COLABORADOR ("o que saiu no chamado 48211?").
  // Nome deliberadamente diferente de `q` (o filtro de SALDOS na mesma página,
  // `itens-filtros.tsx` / `itens/page.tsx`) — reusar `q` aqui quebraria aquele
  // filtro, já que as duas seções escrevem na mesma URL (decisão em DECISOES.md).
  busca?: string | null
  // ITN-03a — ordena por DATA DE NEGÓCIO em vez de por data de registro. Ligado
  // só no recorte em que a coluna "Saldo após" aparece (1 item + 1 filial).
  //
  // ⚠ Por que existe: a coluna é calculada em ordem cronológica de NEGÓCIO
  // (`data`), mas a grade sempre ordenou por `created_at`. Com um lançamento
  // retroativo — entrada de 01/08 digitada em 05/08, depois de uma saída de
  // 03/08 — a linha da entrada apareceria NO TOPO (registrada por último) com o
  // saldo de 01/08, e a saída logo abaixo com o saldo de 03/08: cada célula
  // certa para a sua linha, mas a coluna ilegível de cima para baixo, que é
  // exatamente como se lê "quando o saldo chegou a 15?". Achado da revisão
  // adversarial da F28. Fora desse recorte a ordem não muda: a grade continua
  // "do mais recente registrado para o mais antigo", como a ajuda descreve.
  ordenarPorData?: boolean
}

// Query base (filtros + ordem, sem faixa). O período é sobre a coluna `data` — a
// MESMA exibida na tabela do histórico; `created_at` divergiria do que o
// operador vê (um lançamento de ontem registrado hoje). Devolve uma query NOVA a
// cada chamada: o builder do postgrest-js é mutável e não se reexecuta com
// segurança.
function queryHistorico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: FiltrosHistorico,
  head = false,
) {
  let q = supabase.from('lancamentos_item').select(LEITURA_HISTORICO_LANCAMENTOS.select, { count: 'exact', head })
  q = recortarPorUnidade(q, 'filial_id', opts.unidades)
  if (opts.itemId) q = q.eq('item_id', opts.itemId)
  if (opts.tipo) q = q.eq('tipo', opts.tipo)
  if (opts.de) q = q.gte('data', opts.de)
  if (opts.ate) q = q.lte('data', opts.ate)
  const termo = opts.busca?.trim()
  if (termo) {
    // Sanitiza os metacaracteres do PostgREST/ILIKE antes de interpolar no
    // `.or()` — mesma cobertura de `pendencias-detalhe.ts` (`* % _ , ( ) \`),
    // incluindo o `*` que o PostgREST traduz para `%` no ilike.
    const esc = termo.replace(/[%_*,()\\]/g, ' ')
    q = q.or(`chamado.ilike.%${esc}%,colaborador.ilike.%${esc}%`)
  }
  // `created_at`/`id` seguem como desempate nos dois modos — `data` é uma data
  // PURA e empata o dia inteiro; sem eles a ordem dentro do mesmo dia seria
  // indefinida, e a paginação poderia repetir ou pular linha entre páginas.
  if (opts.ordenarPorData) q = q.order('data', { ascending: false })
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
    autor_nome: r.autor?.nome ?? null,
  }
}

// Faixa pedida além do fim do resultado: o PostgREST responde 416 com este
// código em vez de uma lista vazia. Mesma constante de `listarMovimentacoes`.
const RANGE_INVALIDO = 'PGRST103'

// Histórico paginado (mais recente primeiro), com sinalização de estorno.
// Filtros (F9 · I3): filial, item, tipo e período.
export async function getHistoricoLancamentos(
  opts: FiltrosHistorico & { page?: number; pageSize?: number },
): Promise<{ rows: LancamentoHistorico[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient()
  const pageSize = opts.pageSize ?? 20
  const faixa = (p: number) =>
    queryHistorico(supabase, opts).range((p - 1) * pageSize, (p - 1) * pageSize + pageSize - 1)

  let page = Math.max(1, opts.page ?? 1)
  let { data: bruto, error, count } = await faixa(page)

  // `?page=300` (favorito profundo, filtro que encolheu o resultado) não pode
  // derrubar o painel de /itens: descobrimos o total e mostramos a ÚLTIMA página
  // que existe, em vez de deixar o "Tentar novamente" do error.tsx refalhar para
  // sempre sobre a mesma URL. Uma tentativa só — sem laço. (F12-W4-05.)
  if (error?.code === RANGE_INVALIDO) {
    const { count: total, error: erroTotal } = await queryHistorico(supabase, opts, true)
    if (erroTotal) throw new Error(`Falha ao listar lançamentos: ${erroTotal.message}`)
    page = Math.max(1, Math.ceil((total ?? 0) / pageSize))
    ;({ data: bruto, error, count } = await faixa(page))
  }

  if (error) throw new Error(`Falha ao listar lançamentos: ${error.message}`)
  const rows = linhasDe(bruto, LEITURA_HISTORICO_LANCAMENTOS.forma, LEITURA_HISTORICO_LANCAMENTOS.rotulo)

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
    const recebidas = linhasDe(data, LEITURA_HISTORICO_PARA_EXPORT.forma, LEITURA_HISTORICO_PARA_EXPORT.rotulo)
    for (const r of recebidas) linhas.push(mapearLancamento(r))
    if (recebidas.length === 0 || linhas.length >= total) break
  }

  return { linhas, total }
}

// ---------------------------------------------------------------------------
// ITN-03a — "Saldo após": histórico COMPLETO de um item×filial (F28).
// ---------------------------------------------------------------------------
// Sem os filtros de tipo/data/busca — eles recortariam a história e a conta de
// `calcularSaldoApos` fecharia errado (undo de uma Liberação sem enxergar a
// Entrada anterior). Chamada só quando o filtro do histórico tem EXATAMENTE 1
// item + 1 filial (`ItensPage`); reusa o padrão de blocos de
// `listarHistoricoParaExport` (Max Rows do PostgREST corta silenciosamente
// requests grandes) com o mesmo teto `CAP_EXPORT` — um item×filial chegar
// perto de 5.000 lançamentos não é esperado, e se chegar a função pura degrada
// a coluna em vez de fechar a conta errada (ver `saldo-apos.ts`).
export async function listarLancamentosParaSaldoApos(
  itemId: number,
  filialId: number,
): Promise<LancamentoParaSaldoApos[]> {
  const supabase = await createClient()
  const linhas: LancamentoParaSaldoApos[] = []

  for (let volta = 0; volta < MAX_BLOCOS_EXPORT && linhas.length < CAP_EXPORT; volta++) {
    const tamanho = Math.min(BLOCO_EXPORT, CAP_EXPORT - linhas.length)
    const { data, error } = await supabase
      .from('lancamentos_item')
      .select(LEITURA_LANCAMENTOS_SALDO_APOS.select)
      .eq('item_id', itemId)
      .eq('filial_id', filialId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(linhas.length, linhas.length + tamanho - 1)
    if (error) throw new Error(`Falha ao ler histórico para saldo após: ${error.message}`)
    const recebidas = linhasDe(data, LEITURA_LANCAMENTOS_SALDO_APOS.forma, LEITURA_LANCAMENTOS_SALDO_APOS.rotulo)
    linhas.push(...recebidas)
    if (recebidas.length < tamanho) break
  }

  return linhas
}

// Último lançamento do operador (para "repetir último" — pré-preenche tudo menos
// a quantidade). Ignora os estornos (o inverso não faz sentido repetir).
export async function getUltimoLancamento(userId: string): Promise<UltimoLancamento | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lancamentos_item')
    .select(LEITURA_ULTIMO_LANCAMENTO.select)
    .eq('criado_por', userId)
    .is('estorna_id', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  // Caminho de falha ENGOLIDO (erro-engolido.test.ts): o `error` do Supabase já era
  // descartado aqui — a forma errada segue o MESMO caminho, degradando para `null`.
  const r = linhaOuFalha(data, LEITURA_ULTIMO_LANCAMENTO.forma, LEITURA_ULTIMO_LANCAMENTO.rotulo)
  return r.ok ? r.linha : null
}

// ---------------------------------------------------------------------------
// F38 — "Com esta pessoa" e "o que foi junto"
// ---------------------------------------------------------------------------

/** Uma linha do bloco "Com esta pessoa" (RPC `rel_saldo_colaborador`, 0118). */
export type SaldoDoColaborador = {
  item_id: number
  item: string
  filial_id: number
  filial: string
  com_a_pessoa: number
}

/**
 * O que está COM esta pessoa, por item e filial.
 *
 * É uma PARTIÇÃO de `liberados` (cabeçalho da 0027), não uma conta nova: somando
 * todas as pessoas mais as linhas sem vínculo dá exatamente o `liberados` que a
 * tela de itens sempre mostrou. Linhas que zeraram não voltam.
 */
export async function saldoDoColaborador(
  colaboradorId: string,
): Promise<SaldoDoColaborador[]> {
  const supabase = await createClient()
  const { data, error } = await chamarRpc(supabase, 'rel_saldo_colaborador', {
    p_colaborador: colaboradorId,
  })
  if (error) throw new Error(`Falha ao ler o saldo do colaborador: ${error.message}`)
  return linhasDe(data, LEITURA_SALDO_COLABORADOR.forma, LEITURA_SALDO_COLABORADOR.rotulo)
}

/** O que a tela diz quando o saldo por pessoa não pôde ser lido. */
export const MSG_SALDO_INDISPONIVEL =
  'Não foi possível conferir o que está com esta pessoa agora. Tente de novo em instantes.'

/**
 * O saldo de VÁRIAS pessoas de uma vez — a leitura que a regra §C.3 faz antes de
 * decidir se o `retorno` carrega o vínculo.
 *
 * ⚠ FALHA DE LEITURA NÃO PODE VIRAR "SALDO ZERO". As três actions que aplicam a
 * §C.3 chamavam a RPC descartando o `error`: um blip no banco fazia `saldos` voltar
 * `null`, toda linha era decidida como `sem_saldo`, e o `retorno` era gravado SEM
 * `colaborador_id`. O estoque ficava certo e a conta da pessoa nunca baixava — que
 * é exatamente o furo que a F38 existe para fechar, agora sem rastro nenhum. Por
 * isso esta função devolve o erro em vez de uma lista vazia: quem chama recusa a
 * operação com uma mensagem honesta, e o operador tenta de novo.
 *
 * As consultas são independentes entre si — vão em paralelo, nunca uma por vez.
 */
// F58 — o Map devolve `SaldoDaPessoa[]` (não `SaldoDoColaborador[]`): quem chama esta função
// (itens.ts, movimentacoes.ts, pendencias.ts) só usa `item_id`/`filial_id`/`com_a_pessoa` — os
// dois campos de RÓTULO (`item`, `filial`) são só de `saldoDoColaborador` (singular, a leitura
// que alimenta a TELA). Tipar a origem certa é o que deixa os chamadores lerem o Map sem `as`:
// `SaldoDoColaborador` (mais campos) É atribuível a `SaldoDaPessoa` (menos campos) por
// estrutura — nenhuma linha do corpo desta função muda.
export async function saldosPorColaborador(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: Iterable<string>,
): Promise<
  { ok: true; mapa: Map<string, SaldoDaPessoa[]> } | { ok: false; erro: string }
> {
  const distintos = [...new Set(ids)]
  if (distintos.length === 0) return { ok: true, mapa: new Map() }

  const respostas = await Promise.all(
    distintos.map((id) => chamarRpc(supabase, 'rel_saldo_colaborador', { p_colaborador: id })),
  )

  const mapa = new Map<string, SaldoDaPessoa[]>()
  for (let i = 0; i < distintos.length; i++) {
    const { data, error } = respostas[i]
    if (error) {
      registrarFalha({ escopo: 'itens.saldos-colaboradores', erro: error })
      return { ok: false, erro: MSG_SALDO_INDISPONIVEL }
    }
    const r = linhasOuFalha(data, LEITURA_SALDO_COLABORADOR.forma, LEITURA_SALDO_COLABORADOR.rotulo)
    if (!r.ok) return { ok: false, erro: MSG_SALDO_INDISPONIVEL }
    mapa.set(distintos[i], r.linhas)
  }
  return { ok: true, mapa }
}

/**
 * Quantos lançamentos de item AINDA não têm vínculo com o cadastro de pessoas.
 *
 * ⚠ A CONTAGEM É AGREGADA NO SQL, e isso não é preciosismo: a lição do
 * `docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md` é que contagem nascida de leitura
 * paginada mente em silêncio quando a tabela passa do teto. `head: true` + `count`
 * pede ao PostgREST o número, não as linhas.
 *
 * A honestidade que a F37 instalou continua: enquanto houver lançamento antigo sem
 * vínculo, a tela DIZ quantos são, em vez de fingir um total completo.
 */
export async function lancamentosSemVinculo(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('lancamentos_item')
    .select('id', { count: 'exact', head: true })
    .is('colaborador_id', null)
    .not('colaborador', 'is', null)
  if (error) {
    // Degrada para 0 (o aviso some) em vez de derrubar a tela por um contador.
    registrarFalha({ escopo: 'itens.lancamentos-sem-vinculo', erro: error })
    return 0
  }
  return count ?? 0
}

/** Uma linha de "o que foi junto com este equipamento". */
export type ItemQueFoiJunto = {
  id: string
  item: string
  tipo: TipoLancamento
  quantidade: number
  data: string
  movimentacao_id: string
  /**
   * F42 — o ACERTO AUTOMÁTICO da F41 (`lancamentos_item.regularizacao`, 0125).
   *
   * A F41 criou a marca e as RPCs passaram a gravá-la, mas ESTA leitura nunca
   * pediu a coluna — o selo "regularizado" da ficha do ativo nunca teria como
   * acender. Em produção o cartão inteiro tinha zero linhas até a F41, então o
   * buraco não aparecia; agora que as linhas existem, apareceria.
   */
  regularizacao: boolean
}

/**
 * O que foi junto com um ATIVO — pelo JOIN de `movimentacao_id` (0116), que é a
 * razão de a coluna existir. Nunca por `ativo_id`: a movimentação já aponta o
 * ativo, e uma segunda cópia da mesma verdade é um lugar novo para as duas
 * discordarem.
 */
export async function itensQueForamJunto(ativoId: string): Promise<ItemQueFoiJunto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lancamentos_item')
    .select(LEITURA_ITENS_JUNTO_DO_ATIVO.select)
    .eq('movimentacoes.ativo_id', ativoId)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    registrarFalha({ escopo: 'itens.junto-do-ativo', erro: error })
    return []
  }
  const r = linhasOuFalha(data, LEITURA_ITENS_JUNTO_DO_ATIVO.forma, LEITURA_ITENS_JUNTO_DO_ATIVO.rotulo)
  if (!r.ok) return []
  return r.linhas.map((linha) => ({
    id: linha.id,
    item: linha.itens.nome,
    tipo: linha.tipo,
    quantidade: linha.quantidade,
    data: linha.data,
    movimentacao_id: linha.movimentacao_id ?? '',
    regularizacao: linha.regularizacao,
  }))
}

// ---------------------------------------------------------------------------
// F39 — os acessórios que vão ao TERMO.
// ---------------------------------------------------------------------------

/** Os lançamentos e os tipos que a linha do termo precisa, lidos de uma vez. */
export type AcessoriosDaMovimentacao = {
  lancamentos: LancamentoDeAcessorio[]
  /** Só os tipos que aparecem nos lançamentos — ativos e DESATIVADOS. */
  tipos: TipoDeAcessorio[]
}

/**
 * O que foi junto com a(s) movimentação(ões) de um termo, agrupável por tipo.
 *
 * Molde de `itensQueForamJunto`: o vínculo é `movimentacao_id` (0116), nunca
 * `ativo_id`. O tipo do item e o rótulo vêm no MESMO select — o termo precisa dos
 * três (tipo, rótulo, ordem) e uma segunda consulta só para o vocabulário seria
 * gratuita.
 *
 * ⚠ NENHUMA CONTAGEM NASCE DE LEITURA TRUNCADA, e a conta é esta (corrigida na revisão
 * adversarial da fase, que pegou a constante errada aqui): `prepararTermoSchema` limita o
 * termo a **20 movimentações** (`.max(20)`), e cada movimentação nasce de um LOTE que
 * aceita no máximo **`MAX_ITENS_JUNTO` = 20 linhas de item no lote INTEIRO**
 * (`validators/movimentacao.ts`) — não por movimentação. O pior caso teórico é 20 termos
 * × 20 linhas = 400, ordens de grandeza abaixo de qualquer teto de linhas do PostgREST.
 * ⚠ NÃO confundir com `MAX_LINHAS_LOTE_ITEM` (`validators/item.ts`), que é do CARRINHO de
 * `/itens`: aquele fluxo não grava `movimentacao_id` e não chega aqui.
 *
 * AS DUAS EXCLUSÕES, e as duas são de correção:
 *
 *  · `estorna_id is null` — `estornar_movimentacao_com_itens` (0121, corpo vigente
 *    na 0122) grava o lançamento inverso apontando a movimentação DE ESTORNO, não a
 *    original (está escrito no comentário do `v_novo`). Filtrar pela movimentação do
 *    termo já deixa o inverso de fora; esta exclusão é o CINTO, para o caso de se
 *    preparar termo sobre a própria movimentação de estorno — onde o inverso de uma
 *    entrega apareceria como se fosse acessório devolvido.
 *
 *  · `pendencia_item_id is null` — um item recuperado semanas depois não pode
 *    aparecer como "voltou" num papel cuja `{observacao}` o declara faltante; as
 *    duas linhas se contradiriam no mesmo documento. ⚠ Lido em 29/08/2026,
 *    `resolver_pendencias_item_com_lancamentos` (0119) NÃO grava `movimentacao_id`
 *    nesses lançamentos, então o filtro é redundante NESTE MOMENTO; ele entra
 *    porque declara a intenção e sobrevive ao dia em que alguém passar a vincular.
 */
export async function acessoriosDasMovimentacoes(
  movimentacaoIds: readonly string[],
  tipo: Extract<TipoLancamento, 'saida' | 'retorno'>,
  // ⚠ ACEITA O CLIENT DE QUEM CHAMA (revisão de 29/08/2026), como `listarTiposItem` e
  // `listarFiliais`. `prepararTermo` já tem um client autenticado em mãos; criar outro
  // aqui era reler cookies e remontar o client SSR no meio da própria action.
  client?: Awaited<ReturnType<typeof createClient>>,
): Promise<AcessoriosDaMovimentacao> {
  if (movimentacaoIds.length === 0) return { lancamentos: [], tipos: [] }
  const supabase = client ?? (await createClient())
  const { data, error } = await supabase
    .from('lancamentos_item')
    .select(LEITURA_ACESSORIOS_DAS_MOVIMENTACOES.select)
    .in('movimentacao_id', [...movimentacaoIds])
    .eq('tipo', tipo)
    .is('estorna_id', null)
    .is('pendencia_item_id', null)
  if (error) {
    // Degrada para vazio (o campo abre em branco e continua editável) em vez de
    // derrubar a preparação do termo por causa do pré-preenchimento de um campo.
    registrarFalha({ escopo: 'itens.acessorios-movimentacao', erro: error })
    return { lancamentos: [], tipos: [] }
  }
  const resultado = linhasOuFalha(
    data,
    LEITURA_ACESSORIOS_DAS_MOVIMENTACOES.forma,
    LEITURA_ACESSORIOS_DAS_MOVIMENTACOES.rotulo,
  )
  if (!resultado.ok) return { lancamentos: [], tipos: [] }
  const rows = resultado.linhas
  const tipos = new Map<number, TipoDeAcessorio>()
  for (const r of rows) {
    const t = r.itens.tipos_item
    if (t) tipos.set(t.id, { id: t.id, rotulo: t.rotulo, ordem: t.ordem })
  }
  return {
    // As duas marcas viajam junto de propósito: o filtro do SQL é a primeira
    // linha, e `montarLinhaDeAcessorios` as recusa de novo — a regra é do
    // DOCUMENTO, não da consulta, e é lá que ela tem teste.
    lancamentos: rows.map((r) => ({
      tipo_id: r.itens.tipo_id,
      quantidade: r.quantidade,
      estorna_id: r.estorna_id,
      pendencia_item_id: r.pendencia_item_id,
    })),
    tipos: [...tipos.values()],
  }
}
