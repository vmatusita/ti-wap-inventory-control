// OS SLUGS RESERVADOS DAS UNIDADES — fonte ÚNICA (F57 · Frente D).
//
// Duas palavras não podem virar slug de filial porque já significam outra coisa nas URLs do
// sistema (a regra é da F25; a casa única é da F57):
//
//   `todas` — a sentinela de "sem recorte" do filtro de filial (`?filial=todas`). Em
//             /pendencias o filtro é POR SLUG, então uma filial chamada `todas` tornaria o
//             link ambíguo.
//   `geral` — o Consolidado: a aba `/relatorios/geral` e o valor especial do filtro de
//             `/relatorios/gerados`, que pede as linhas SEM filial (`filial_id is null`). Já
//             era reservado de fato desde a F3; nunca esteve escrito até a F25.
//
// Nenhuma filial real usa essas palavras (conferido nos dois bancos em 04/08/2026).
//
// POR QUE UMA FONTE SÓ. Até a F57 as mesmas duas palavras moravam em quatro constantes — o
// `SLUGS_RESERVADOS` privado de `validators/admin.ts`, o `SLUG_CONSOLIDADO` privado de
// `queries/gerados.ts`, o `ABA_RELATORIO_CONSOLIDADO` de `auth/papeis.ts` e a sentinela
// `FILIAL_TODAS` de `url-params.ts` — e em literais soltos de mais quatro arquivos. Uma cópia
// que mudasse sozinha quebraria o link do Consolidado numa tela e não na outra, sem erro de
// compilação nenhum. A trava (`slugs.test.ts`) recusa o literal exato em `src/lib/**` fora
// deste arquivo.
//
// ⚠ HOMÔNIMO SEM RELAÇÃO: `SLUGS_RESERVADOS` de `src/lib/ajuda/registry.ts` são slugs de PÁGINA
// DE AJUDA (hoje, `manual`), não de filial. Mesmo nome, outro espaço de nomes. NÃO os unifique —
// a F57 mediu e decidiu (ata em `docs/DECISOES.md`): trazê-lo para cá reservaria `manual` como
// nome de filial e `geral`/`todas` como nome de página. Dois defeitos no lugar de um nome.

/** A sentinela de "todas as filiais" na URL (`?filial=todas`). */
export const FILIAL_TODAS = 'todas'

/**
 * O slug do Consolidado — a aba de `/relatorios` e o valor do filtro de `/relatorios/gerados`
 * que pede os snapshots sem filial. No banco ele é `filial_id is null`, e não uma linha de
 * `filiais`.
 */
export const SLUG_CONSOLIDADO = 'geral'

/** As palavras que nenhuma filial pode usar como slug (`filialSchema`, validators/admin.ts). */
export const SLUGS_RESERVADOS = [FILIAL_TODAS, SLUG_CONSOLIDADO] as const
