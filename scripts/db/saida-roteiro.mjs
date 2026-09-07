// =============================================================================
// saida-roteiro.mjs — a LEITURA da saída de um roteiro SQL (F47)
// =============================================================================
// As duas funções PURAS de que o injetor depende para decidir. Vivem fora do motor
// (`scripts/db/run-mutation-tests.mjs`) porque o motor fala com Postgres e a mesa
// não tem Postgres: separadas, elas são testáveis na mesa
// (`scripts/db/saida-roteiro.test.mts`), e é justamente aqui que mora a regra que,
// errada, faria o injetor mentir com convicção.
// =============================================================================

/**
 * Os rótulos que ficaram `✗`, como TOKENS.
 *
 * ⚠ TOKEN, NUNCA SUBSTRING. Os roteiros estão cheios de rótulo que é prefixo de
 * outro: `2c`/`2c-bis`/`2c-ter`, `4e`/`4e-bis`/`4e-ter`, `12a`…`12e`, e em
 * `dev_destrutivo.sql` o rótulo NU `1` é prefixo de outros dezenove. Um
 * `saida.includes('✗ 2c')` acenderia para o cenário errado, e o injetor diria com
 * toda a confiança que a mutação foi detectada — pelo cenário errado.
 *
 * ⚠ `\s+` e não um espaço: `conflito_filiais.sql` usa DOIS espaços depois do ✗ em
 * todas as 74 linhas dele; os demais roteiros usam um.
 *
 * ⚠ `TOTAL` fica de fora. Os roteiros fecham com um agregado
 * (`✗ TOTAL <roteiro>: N falha(s) — <códigos>`) que não é cenário; pior, o texto
 * agregado carrega códigos como `12c_CONFIRMACAO_ITEM`, e quem lesse o BLOB inteiro
 * por substring atribuiria uma falha de `12c` também a `2c`.
 *
 * @param {string} saida stdout+stderr do runner
 * @returns {Set<string>}
 */
export function rotulosCaidos(saida) {
  const achados = new Set()
  for (const m of saida.matchAll(/(?:WARNING|NOTICE):\s+✗\s+(\S+)/g)) {
    if (m[1] === 'TOTAL') continue
    achados.add(m[1])
  }
  return achados
}

/**
 * O roteiro chegou ao fim?
 *
 * A linha `FIM <nome>: N asserções, M falhas` é a ÚLTIMA instrução do último bloco
 * `do $$` de todo roteiro — ela só sai se o roteiro não morreu no meio. É a mesma
 * linha que `scripts/db/rodar-roteiros.sh` exige, e o injetor a usa para separar
 * dois diagnósticos que se pareceriam: "o cenário nomeado não caiu" (asserção fraca,
 * o achado da fase) e "o roteiro abortou antes de chegar lá" (outra coisa inteira).
 *
 * @param {string} saida
 * @param {string} roteiro nome do arquivo, com ou sem `.sql`
 */
export function emitiuLinhaFim(saida, roteiro) {
  const nome = roteiro.replace(/\.sql$/, '')
  return new RegExp(`FIM ${nome}: \\d+ asserções, \\d+ falhas`).test(saida)
}
