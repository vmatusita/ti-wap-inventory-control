// Parsers dos parâmetros de URL das listas (F12 · W6A).
//
// POR QUE UM MÓDULO: até aqui `idNumerico`, `dataISO` e `paginaNumerica` viviam
// COPIADOS em `/ativos`, `/itens`, `/movimentacoes`, `/pendencias` e nas actions
// de export. Cada correção da F9/F11 entrou em algumas cópias e não em todas — e
// foi exatamente a divergência entre elas que produziu os achados F12-W4-01,
// -03, -04 e -05 (a faixa sã de datas nunca chegou ao export; o teto de página
// nunca chegou a /itens e /pendencias). Uma fonte só, testada, encerra a família.
//
// DOUTRINA COMUM: param inválido é IGNORADO — nunca vira filtro no banco e nunca
// derruba o Server Component. Quem chama decide o default.

// `filial_id`/`item_id` são `smallint` (migration 0015): validar só o FORMATO
// deixaria passar `?filial=99999`, que o Postgres recusa (22003) e derruba a
// leitura. Achado da revisão adversarial da F9.
export const MAX_SMALLINT = 32767

// Faixa sã de datas. O round-trip do `Date` NÃO basta: o JS tem ano 0 e aceita
// `0000-01-01`, mas o Postgres não (22008) — a query lançaria. Comparação de
// string funciona porque o formato é fixo `yyyy-MM-dd`.
export const DATA_MIN = '1900-01-01'
export const DATA_MAX = '2999-12-31'

// Página: validar só o FORMATO deixaria passar `?page=99999999999999999999`, que
// vira 1e20 — o `from` do `range()` estoura o inteiro exato, o postgrest-js
// serializa `offset=3e+21` e o PostgREST DESCARTA o offset ilegível (200, sem
// PGRST103, então o fallback de "última página" não roda). A tela trava: rodapé
// com notação científica e "Anterior" que reenvia a MESMA URL. Sete dígitos
// cobrem qualquer acervo plausível e mantêm o caminho PGRST103 intacto.
export const MAX_PAGE = 9_999_999

/** Id de tabela pequena (`smallint`). `null` = ignorar o param. */
export function idNumerico(v: string | null | undefined): number | null {
  if (!v || !/^\d+$/.test(v)) return null
  const n = Number(v)
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_SMALLINT ? n : null
}

/** Data pura `yyyy-MM-dd`. Descarta data inexistente (2026-02-31, que o `Date`
 *  "rolaria" para março) e data fora da faixa sã. `null` = ignorar o param. */
export function dataISO(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  if (v < DATA_MIN || v > DATA_MAX) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

// `id` de ativo/movimentação/termo/snapshot é `uuid` no banco: um valor fora do
// formato faz o Postgres devolver 22P02 e a leitura LANÇA — o Server Component cai
// no error boundary genérico ("algo deu errado") onde o certo seria um 404. Mesma
// doutrina dos parsers acima: valor inválido é IGNORADO, quem chama decide o que
// fazer (`notFound()`, `null`, mensagem de "registro inválido").
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O valor tem a forma de um uuid? (aceita espaços nas pontas) */
export function ehUuid(v: string | null | undefined): boolean {
  return !!v && UUID_RE.test(v.trim())
}

/** Página da lista. Fora da faixa (lixo, 0, negativo, absurdo) volta para 1 —
 *  nunca `NaN`, nunca notação científica no `range()`. */
export function paginaNumerica(v: string | null | undefined): number {
  if (!v || !/^\d+$/.test(v)) return 1
  const n = Number(v)
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1
}

// ---------------------------------------------------------------------------
// F25 — o param `filial` vira LISTA (multi-seleção)
// ---------------------------------------------------------------------------
// O ponto sutil da fase: `filial` passa a ter TRÊS estados, não dois.
//
//   ausente        → PADRÃO DO CARGO (operador entra com as filiais vinculadas
//                    dele já marcadas; os demais cargos, com todas)
//   `filial=todas` → SENTINELA de "sem recorte", explícita
//   `filial=2,3`   → essas filiais, igual para qualquer cargo (link compartilhável)
//
// Sem a sentinela não haveria como o operador pedir "todas": a ausência do param
// já significa o padrão dele. Por isso a lista vazia NÃO pode representar as duas
// coisas — daí o tipo discriminado em vez de um `number[]`.
//
// Um `filial=` só com lixo (`?filial=abc`) cai em `padrao`, e não em `todas`: é a
// doutrina do módulo (param inválido é IGNORADO, como se não tivesse vindo).

/** A sentinela de "todas as filiais" na URL. Reservada em `filialSchema.slug`
 *  (validators/admin.ts) para nunca colidir com o slug de uma filial de verdade. */
export const FILIAL_TODAS = 'todas'

// Teto de itens: `.in()` monta o filtro na URL do PostgREST, e `?filial=3,3,3,…`
// repetido milhares de vezes é entrada de usuário (a mesma razão registrada em
// queries/dev-destrutivo.ts). São 5 filiais na vida real; 50 é folga com sobra.
const MAX_FILIAIS = 50

// Slug de filial: o MESMO formato de `SLUG_RE` de validators/admin.ts. Repetido
// aqui de propósito — este módulo é o chão dos parsers e não importa validador
// nenhum; o que garante que os dois não divirjam é o teste.
const SLUG_FILIAL_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type SelecaoFilial<T> =
  | { modo: 'padrao' }
  | { modo: 'todas' }
  | { modo: 'lista'; valores: T[] }

function itensCsv(v: string | null | undefined): string[] {
  if (!v) return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_FILIAIS)
}

// O núcleo comum das duas famílias de `filial` (id numérico e slug — ver o
// comentário de `selecaoFilialSlugs`). A sentinela vence sempre que aparece:
// `?filial=todas,3` é lido como "sem recorte", que é a leitura menos surpreendente
// (o usuário pediu todas em algum lugar da lista).
function selecao<T>(
  v: string | null | undefined,
  converter: (item: string) => T | null,
): SelecaoFilial<T> {
  const itens = itensCsv(v)
  if (itens.length === 0) return { modo: 'padrao' }
  if (itens.some((i) => i.toLowerCase() === FILIAL_TODAS)) return { modo: 'todas' }
  const valores: T[] = []
  for (const item of itens) {
    const convertido = converter(item)
    // Item inválido é DESCARTADO — nunca contamina a lista nem derruba a página.
    if (convertido !== null && !valores.includes(convertido)) valores.push(convertido)
  }
  // Tudo era lixo: equivale a não ter vindo param nenhum.
  return valores.length > 0 ? { modo: 'lista', valores } : { modo: 'padrao' }
}

// ---------------------------------------------------------------------------
// F25 — a VISÃO de /itens (o default inverteu)
// ---------------------------------------------------------------------------
// Até a F24 o teste literal `visao === 'filiais'` vivia COPIADO em três arquivos
// (a page, o componente de filtros e a action de export) e o default era o
// Consolidado. A F25 inverteu: a tela abre LADO A LADO, e só a sentinela explícita
// `visao=consolidado` desliga.
//
// Inverter um default espalhado em três cópias é o roteiro exato do achado
// F12-W4-03 (o CSV recortado enquanto a tela mostrava tudo). Por isso a régua vira
// função única aqui, e as três cópias passam a chamá-la.
//
// RETROCOMPATÍVEL: `?visao=filiais` continua significando lado a lado — é o mesmo
// resultado do default, então favorito antigo abre igual.

/** `true` só para a sentinela explícita do Consolidado. Ausência e lixo caem no
 *  padrão novo (por filial). */
export function ehVisaoConsolidado(v: string | null | undefined): boolean {
  return v === 'consolidado'
}

/** `filial` das telas que filtram por ID (`/ativos`, `/movimentacoes`, `/itens`). */
export function selecaoFilialIds(v: string | null | undefined): SelecaoFilial<number> {
  return selecao(v, idNumerico)
}

/** `filial` das telas que filtram por SLUG (`/pendencias`, `/relatorios/gerados`).
 *
 *  As duas famílias continuam existindo de propósito: `v_fila_pendencias.filial` e
 *  `v_conflitos_filiais.filial` expõem o SLUG, não o id, e forçar a unificação
 *  significaria mexer nas views por conveniência de URL. Decisão registrada. */
export function selecaoFilialSlugs(v: string | null | undefined): SelecaoFilial<string> {
  return selecao(v, (s) => {
    const slug = s.toLowerCase()
    return SLUG_FILIAL_RE.test(slug) ? slug : null
  })
}
