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
