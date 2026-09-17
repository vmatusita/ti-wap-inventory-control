// A LISTA DE ITENS — a aritmética e o recorte da tela `/itens` (F42 · frente A).
//
// Módulo PURO: sem React, sem banco, sem `next/navigation`. É aqui que mora tudo
// o que a tela precisa DECIDIR antes de desenhar, para que o Vitest possa provar
// caso a caso — este repositório não renderiza componente em teste, então o que
// precisa de prova vira função pura (ver `docs/PLANO-DESIGN-SYSTEM.md` e o
// precedente de `src/lib/ativos/lista.ts`, que faz o mesmo por `/ativos`).

import { GRUPO_ITEM_ORDEM, type GrupoItem } from '@/lib/dominio'
import type { SaldoDoPar } from '@/lib/itens/regularizacao'
import { lerUnidades, type UnidadesEfetivas } from '@/lib/auth/recorte-leitura'

// ---------------------------------------------------------------------------
// 1 · "EM USO" — a coluna que a F41 batizou e não transformou em coluna
// ---------------------------------------------------------------------------
//
// `rel_saldo_itens` (migration `0027_itens_total_estoque.sql`, nunca recriada
// depois) CALCULA o número, mas não o devolve. Dentro dela:
//
//     liberados = greatest(0, Σsaida − Σretorno)      ← "em uso com as pessoas"
//     estoque   = greatest(0, total − atrelados − liberados)
//     falta     = greatest(0, atrelados + liberados − total)
//
// As duas últimas são o MESMO clamp aplicado aos dois lados opostos da mesma
// expressão `x = total − atrelados − liberados`: uma é `max(0, x)`, a outra é
// `max(0, −x)`. E `max(0, x) − max(0, −x) ≡ x` para todo `x`. Logo:
//
//     total + falta − estoque − atrelados ≡ liberados
//
// exata nos DOIS ramos, sem caso de borda — provado em `lista.test.ts` e conferido
// contra `SELECT` agregado em produção E em ensaio (relatório da F42, §"Em uso").
//
// ⚠ SEM `Math.max(0, …)` aqui. A derivação já devolve o valor JÁ clampado pela
// RPC; um clamp a mais não corrigiria nada e esconderia a única coisa que este
// número tem a dizer se um dia divergir. Se der negativo, é para aparecer.
//
// ⚠ E NUNCA leia "em uso" de uma segunda fonte. Esta fase não tem migration: a
// coluna se DERIVA do que a RPC já devolve, e essa é a única fonte da verdade.

/** As quatro colunas que `rel_saldo_itens` devolve. */
export type NumerosDoItem = {
  total: number
  estoque: number
  atrelados: number
  falta: number
}

/** `Σ saída − Σ devolução` — quantas unidades estão com as pessoas. */
export function emUsoDoSaldo(s: NumerosDoItem): number {
  return s.total + s.falta - s.estoque - s.atrelados
}

/**
 * O par `{ emEstoque, emUso }` que `partirQuantidade` (a prévia da regularização,
 * F41) pede — por item, a partir dos saldos de UMA filial.
 *
 * É o que permite a prévia do diálogo cobrir os DOIS tipos particionáveis sem
 * migration: `saida` só precisa de `emEstoque`, `retorno` precisa de `emUso`.
 */
export function saldoDoParPorItem(
  saldos: readonly ({ item_id: number } & NumerosDoItem)[],
): Readonly<Record<number, SaldoDoPar>> {
  const mapa: Record<number, SaldoDoPar> = {}
  for (const s of saldos) {
    mapa[s.item_id] = { emEstoque: s.estoque, emUso: emUsoDoSaldo(s) }
  }
  return mapa
}

// ---------------------------------------------------------------------------
// 2 · O RECORTE DE FILIAL — uma leitura só alimenta a tabela E a linha expansível
// ---------------------------------------------------------------------------
//
// Antes da F42, `/itens` tinha DUAS leituras mutuamente exclusivas (a consolidada
// e a lado-a-lado), escolhidas por `?visao=`. Duas leituras da mesma verdade é
// como a tela e o CSV divergiram no achado F12-W4-03. Agora é uma só:
// `getSaldosPorFilial` traz `porFilial` + `consolidado` de cada item, e o recorte
// se calcula aqui.
//
// ⚠ SEM recorte usa `consolidado`, e não a soma das colunas: o consolidado é o
// NÍVEL DO TOTAL da RPC chamada com a lista de TODAS as filiais (F60 — até a F59,
// a chamada com o recorte nulo), que enxerga também a filial DESATIVADA com saldo
// (é o que `estoqueForaDasColunas` existe para denunciar). Somar as colunas
// devolveria um total menor que o verdadeiro.

export type LinhaComFiliais = {
  porFilial: Readonly<Record<number, NumerosDoItem>>
  consolidado: NumerosDoItem
}

const ZERO: NumerosDoItem = { total: 0, estoque: 0, atrelados: 0, falta: 0 }

/**
 * Os números que a tabela mostra: o consolidado quando não há recorte, a soma das
 * filiais marcadas quando há.
 *
 * A soma é célula a célula pelo mesmo motivo de `somarSaldosDeFiliais`: cada clamp
 * da RPC é aplicado DENTRO de uma filial, então as quatro colunas são aditivas.
 *
 * F57 — recebe `UnidadesEfetivas`: o "sem recorte" é o modo `todas`, com nome. Uma interseção
 * vazia (`nenhuma`) — ou o pedido de linhas sem filial, que o diário de itens não tem — soma
 * NADA: zero, e nunca o consolidado. É o fail-open da convenção antiga, fechado em memória.
 */
export function saldoDoRecorte(
  linha: LinhaComFiliais,
  unidades: UnidadesEfetivas<'id'>,
): NumerosDoItem {
  const vista = lerUnidades(unidades)
  if (vista.modo === 'todas') return linha.consolidado
  const soma = { ...ZERO }
  if (vista.modo !== 'lista') return soma
  for (const id of vista.valores) {
    const c = linha.porFilial[id]
    if (!c) continue
    soma.total += c.total
    soma.estoque += c.estoque
    soma.atrelados += c.atrelados
    soma.falta += c.falta
  }
  return soma
}

// ---------------------------------------------------------------------------
// 2b · A LINHA DA TABELA — o que o servidor entrega pronto ao componente
// ---------------------------------------------------------------------------
//
// A tabela é CLIENT (o chevron guarda estado), então tudo que não é estado tem de
// chegar resolvido por prop. Montar a linha aqui, e não lá, é o que permite provar
// por teste que o número da tabela, o número da linha expansível e o do CSV saem
// da MESMA conta — que é a divergência do achado F12-W4-03, agora impossível.

export type LinhaDeItem = {
  item_id: number
  item: string
  grupo: GrupoItem
  ordem: number
  /** O rótulo de `tipos_item` (F37), ou `null` — o catálogo antigo nasceu sem tipo. */
  tipoRotulo: string | null
  /** Os números do RECORTE — o que a tabela mostra. */
  saldo: NumerosDoItem
  /** Os números de TODAS as filiais.
   *
   *  ⚠ NÃO É MAIS ELE QUE O AVISO "repor" COMPARA. Até a v1.48.0 era — decisão de
   *  22/07/2026, "o mínimo é do ITEM, não da filial" —, e a F44 revogou essa parte
   *  (Johnny, 01/09/2026): o selo e o cartão *A repor* passaram os dois a usar
   *  `saldo` (o estoque do RECORTE), e é isso que os faz nunca discordarem. Ver
   *  `components/itens/badge-repor.tsx` e `lib/itens/distribuicao.ts`.
   *
   *  Restou como o número GLOBAL da linha: alimenta `foraDasFiliais` e o aviso de
   *  reservado da linha expansível, que soma todas as filiais e diz isso. */
  consolidado: NumerosDoItem
  porFilial: Readonly<Record<number, NumerosDoItem>>
  /** Estoque que o consolidado tem e nenhuma das filiais listadas mostra. */
  foraDasFiliais: number
}

export type LinhaDeSaldoPorFilial = {
  item_id: number
  item: string
  grupo: GrupoItem
  ordem: number
} & LinhaComFiliais

/**
 * Junta saldo, catálogo e recorte numa linha pronta para a tabela.
 *
 * `unidades` recorta os NÚMEROS (F57 — já efetivadas); `filiaisVisiveis` são as filiais que a linha
 * expansível vai listar (as mesmas, quando há recorte; todas, quando não há).
 * `foraDasFiliais` é a diferença — normalmente zero, e quando não é, a tela diz.
 */
export function montarLinhasDeItem({
  linhas,
  unidades,
  filiaisVisiveis,
  tiposPorItem,
}: {
  linhas: readonly LinhaDeSaldoPorFilial[]
  unidades: UnidadesEfetivas<'id'>
  filiaisVisiveis: readonly number[]
  tiposPorItem: Readonly<Record<number, string | null>>
}): LinhaDeItem[] {
  return linhas.map((l) => {
    const saldo = saldoDoRecorte(l, unidades)
    const somaVisivel = filiaisVisiveis.reduce(
      (acc, id) => acc + (l.porFilial[id]?.estoque ?? 0),
      0,
    )
    const fora = saldo.estoque - somaVisivel
    return {
      item_id: l.item_id,
      item: l.item,
      grupo: l.grupo,
      ordem: l.ordem,
      tipoRotulo: tiposPorItem[l.item_id] ?? null,
      saldo,
      consolidado: l.consolidado,
      porFilial: l.porFilial,
      foraDasFiliais: fora > 0 ? fora : 0,
    }
  })
}

/**
 * `itens.id` → o rótulo do tipo (F37), ou `null` quando o item não tem tipo.
 *
 * Cruza o catálogo com `listarTiposItem()` — o catálogo INTEIRO, não só os ativos:
 * um item que aponta para um tipo DESATIVADO tem de continuar exibindo o rótulo
 * dele, e não um branco. É a mesma lição que `/admin/itens` pagou em 28/08/2026.
 */
export function tiposPorItemDoCatalogo(
  itens: readonly { id: number; tipo_id: number | null }[],
  tipos: readonly { id: number; rotulo: string }[],
): Readonly<Record<number, string | null>> {
  const porId = new Map(tipos.map((t) => [t.id, t.rotulo]))
  const mapa: Record<number, string | null> = {}
  for (const i of itens) {
    mapa[i.id] = i.tipo_id == null ? null : (porId.get(i.tipo_id) ?? null)
  }
  return mapa
}

// ---------------------------------------------------------------------------
// 3 · FILTRO E PAGINAÇÃO — em memória, como a tela já assumia
// ---------------------------------------------------------------------------
//
// O catálogo é curto (22 itens em produção) e a RPC de saldo não pagina. `q` e
// `grupo` sempre foram aplicados em CÓDIGO — inclusive no export, que replica os
// dois filtros pelo mesmo motivo. A paginação entra no mesmo lugar: ela existe
// para a tela ter a MESMA gramática de `/ativos`, não para poupar o banco.

export type LinhaFiltravel = { item: string; grupo: GrupoItem }

/** Aplica busca por nome (sem distinção de caixa) e recorte de grupo. */
export function filtrarSaldos<T extends LinhaFiltravel>(
  linhas: readonly T[],
  filtros: { q?: string; grupo?: GrupoItem },
): T[] {
  const q = (filtros.q ?? '').trim().toLowerCase()
  const grupo = filtros.grupo
  return linhas.filter(
    (l) => (!grupo || l.grupo === grupo) && (!q || l.item.toLowerCase().includes(q)),
  )
}

/**
 * Ordem de exibição: a mesma de sempre — grupo, `ordem` do catálogo, nome.
 * Com uma tabela só (e não uma seção por grupo) a ordenação precisa ser explícita:
 * ela era o efeito colateral de montar um bloco por grupo.
 */
export function ordenarSaldos<T extends LinhaFiltravel & { ordem: number }>(
  linhas: readonly T[],
): T[] {
  return [...linhas].sort(
    (a, b) =>
      GRUPO_ITEM_ORDEM.indexOf(a.grupo) - GRUPO_ITEM_ORDEM.indexOf(b.grupo) ||
      a.ordem - b.ordem ||
      a.item.localeCompare(b.item, 'pt-BR'),
  )
}

export type PaginaDeLinhas<T> = {
  rows: T[]
  page: number
  pageSize: number
  total: number
}

/**
 * A fatia da página pedida.
 *
 * `page` além do fim CAI NA ÚLTIMA página existente, em vez de devolver lista
 * vazia — é a mesma degradação que `getHistoricoLancamentos` faz com o `PGRST103`
 * do PostgREST (achado F12-W4-05), e pelo mesmo motivo: o rodapé anunciaria uma
 * página que não existe e o "Anterior" seria idempotente.
 */
export function paginarLinhas<T>(
  linhas: readonly T[],
  page: number,
  pageSize: number,
): PaginaDeLinhas<T> {
  const total = linhas.length
  const tamanho = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 50
  const ultima = Math.max(1, Math.ceil(total / tamanho))
  const pedida = Number.isInteger(page) && page > 0 ? page : 1
  const atual = Math.min(pedida, ultima)
  const inicio = (atual - 1) * tamanho
  return { rows: linhas.slice(inicio, inicio + tamanho), page: atual, pageSize: tamanho, total }
}

// ---------------------------------------------------------------------------
// 4 · O SUBTÍTULO — o mesmo contrato de `rotuloSubtitulo` de /ativos
// ---------------------------------------------------------------------------

/**
 * A linha sob o título: quantos itens, e se o número está recortado.
 *
 * Espelha `src/lib/ativos/lista.ts` — a tela de itens passa a dizer a mesma coisa
 * do mesmo jeito, que é o objetivo declarado da fase.
 */
export function rotuloSubtituloItens({
  total,
  temFiltro,
  temRecorteFilial,
}: {
  total: number
  temFiltro: boolean
  temRecorteFilial: boolean
}): string {
  const n = total.toLocaleString('pt-BR')
  const plural = total === 1 ? 'item' : 'itens'
  if (temFiltro) return `${n} ${plural} nestes filtros`
  if (temRecorteFilial) return `${n} ${plural} nas suas filiais`
  return `${n} ${plural} no catálogo`
}

// ---------------------------------------------------------------------------
// 5 · O LINK ANTIGO DO HISTÓRICO — /itens?tipo=…&de=… não pode virar tela morta
// ---------------------------------------------------------------------------
//
// Até a v1.46.0 o histórico morava DENTRO de `/itens`, e os cinco params dele
// viajavam na mesma querystring dos saldos. Um favorito, um link colado num
// chamado ou o botão "voltar" do navegador continuam trazendo essa URL — e sem
// isto ela abriria a tela de saldos ignorando o recorte em silêncio, que é pior
// que um 404: o operador leria a lista errada achando que é a certa.
//
// Precedente da casa: `src/components/ajuda/redireciona-ancora-legada.tsx`.
//
// ⚠ `q` NÃO entra: `q` é o filtro de SALDOS (o do histórico é `busca`, e o comentário
// de `historico-filtros.tsx` explica por que os nomes são diferentes). Levar `q`
// junto trocaria um filtro pelo outro no meio do caminho.

/** Os params que só o histórico usava. Ver `historico-filtros.tsx`. */
export const PARAMS_SO_DO_HISTORICO = ['item', 'tipo', 'de', 'ate', 'busca'] as const

/** Os que valem nas duas telas e viajam junto no redirecionamento. */
const PARAMS_COMPARTILHADOS = ['filial', 'page'] as const

/**
 * Os params que o redirecionamento olha, JÁ LIDOS pelo chamador.
 *
 * ⚠ É UM OBJETO SIMPLES, e a razão é um defeito que esta fase pagou em produção.
 * A primeira escrita recebia um `URLSearchParams` que o Server Component montava
 * com `Object.entries(searchParams)` — e em produção o redirect **nunca disparou**:
 * `HTTP 200 sem o conteúdo esperado`, pego pelo smoke pós-deploy. O objeto de
 * `searchParams` do Next não se deixa enumerar assim (o acesso é por CHAVE, não por
 * varredura), então `Object.entries` devolvia vazio, `legado` nascia sem nada e a
 * função respondia `null` — corretamente, sobre uma entrada errada.
 *
 * O teste unitário passava o tempo todo, porque montava o `URLSearchParams` à mão:
 * a função pura estava certa e o WIRING estava errado. Recebendo um objeto que o
 * chamador preenche com acessos NOMINAIS (`sp.tipo`, `sp.de`…), o erro deixa de ser
 * possível — e `paginaLeParamsNominalmente` (em `lista.test.ts`) vigia a fonte.
 */
export type ParamsLegadoDeItens = {
  item?: string
  tipo?: string
  de?: string
  ate?: string
  busca?: string
  filial?: string
  page?: string
}

/**
 * O destino de um link antigo de histórico, ou `null` quando a URL é de saldos.
 *
 * Devolve o caminho pronto — nada de `URL`, para o Server Component poder passá-lo
 * direto ao `redirect()` e o teste poder chamar sem DOM.
 */
export function destinoHistoricoLegado(params: ParamsLegadoDeItens): string | null {
  const valor = (p: keyof ParamsLegadoDeItens) => (params[p] ?? '').trim()
  const temHistorico = PARAMS_SO_DO_HISTORICO.some((p) => valor(p) !== '')
  if (!temHistorico) return null
  const destino = new URLSearchParams()
  for (const p of [...PARAMS_SO_DO_HISTORICO, ...PARAMS_COMPARTILHADOS]) {
    const v = valor(p)
    if (v) destino.set(p, v)
  }
  const qs = destino.toString()
  return qs ? `/itens/historico?${qs}` : '/itens/historico'
}
