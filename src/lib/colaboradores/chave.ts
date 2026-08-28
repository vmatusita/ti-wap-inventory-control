// A chave de deduplicação de nome de pessoa (F37 · D5) — espelho EXATO da função
// `public.colaborador_chave(text)` da migration 0112.
//
// POR QUE ESTE ARQUIVO EXISTE. O híbrido grava `colaborador_id` no INSERT do registro
// novo resolvendo o TEXTO que o operador deixou no campo. Para achar o cadastro, o
// servidor precisa da chave — e a coluna do banco é GERADA, então não dá para pedir
// ao Postgres que normalize um valor de entrada dentro de um `select … in (…)` do
// PostgREST. A normalização acontece aqui, e a igualdade com o SQL é PROVADA por
// `chave-sql.test.ts`, que lê a tabela de acentos e a classe de espaço direto da
// migration vigente.
//
// AS DUAS ARMADILHAS QUE A EXPRESSÃO EVITA (as duas já derrubaram gente):
//
//   1. `\s` NÃO é o mesmo conjunto nos dois lados. No Postgres `\s` é `[[:space:]]`
//      (sensível a locale); no JavaScript inclui NBSP (U+00A0) e vários espaços
//      Unicode. Um nome colado do Excel com NBSP normalizaria diferente em cada lado
//      — e o vínculo simplesmente não aconteceria, em silêncio. Por isso os dois
//      lados usam a MESMA classe explícita: espaço, \t, \n, \r, \f, \v.
//
//   2. `String.prototype.trim()` apara espaço Unicode; `btrim(text)` do Postgres apara
//      SÓ o espaço ASCII. Daí o `aparar()` abaixo, feito à mão. E o aparo vem DEPOIS
//      do colapso nos dois lados, senão `'\tJoão'` viraria ` joao`, com um espaço
//      grudado na chave.
//
// A ordem das operações é a da função SQL, na mesma sequência:
//   translate(acentos) → colapsa espaço → apara espaço → minúsculas
//
// SE OS DOIS LADOS DIVERGIREM mesmo assim (um caractere exótico que `lower()` do
// Postgres e `toLowerCase()` do JavaScript tratem diferente), o efeito é uma busca que
// não acha: `colaborador_id` fica nulo e o registro é gravado do mesmo jeito, com o
// texto. Nunca um vínculo ERRADO, nunca uma falha na cara do operador.

/** Acentuadas → sem acento, na ORDEM da migration 0112. Um caractere de cada lado. */
export const ACENTOS_DE =
  'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ'
export const ACENTOS_PARA =
  'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'

/** A classe de espaço da migration — explícita de propósito (ver armadilha 1). */
export const ESPACOS_DA_CHAVE = [' ', '\t', '\n', '\r', '\f', '\v'] as const

const MAPA = new Map<string, string>(
  [...ACENTOS_DE].map((c, i) => [c, ACENTOS_PARA[i]]),
)
const RE_ESPACOS = /[ \t\n\r\f\v]+/g

/** `btrim(x)` do Postgres: apara SÓ o espaço ASCII, nunca espaço Unicode. */
function aparar(texto: string): string {
  return texto.replace(/^ +/, '').replace(/ +$/, '')
}

/**
 * A chave normalizada de um nome: minúsculas, sem acento, espaços colapsados e
 * aparados. Espelho de `public.colaborador_chave(text)` (migration 0112).
 *
 * Devolve `''` para entrada vazia ou só de espaço — e `''` NUNCA casa com cadastro
 * nenhum, porque a tabela recusa nome em branco (`colaboradores_nome_nao_vazio`).
 */
export function chaveColaborador(nome: string | null | undefined): string {
  if (!nome) return ''
  let saida = ''
  for (const c of nome) saida += MAPA.get(c) ?? c
  return aparar(saida.replace(RE_ESPACOS, ' ')).toLowerCase()
}

/**
 * As chaves distintas e não vazias de uma lista de nomes, na ordem em que aparecem.
 * É o que a Server Action manda ao banco numa consulta só, antes de inserir o lote —
 * em vez de uma consulta por linha.
 */
export function chavesDistintas(
  nomes: readonly (string | null | undefined)[],
): string[] {
  const vistas = new Set<string>()
  const saida: string[] = []
  for (const n of nomes) {
    const c = chaveColaborador(n)
    if (c && !vistas.has(c)) {
      vistas.add(c)
      saida.push(c)
    }
  }
  return saida
}
