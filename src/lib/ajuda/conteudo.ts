// COMPATIBILIDADE. Ate a F19 este arquivo era o manual inteiro (56 KB numa
// pagina so). A F20 fatiou o conteudo em `src/lib/ajuda/conteudo/<slug>.ts`,
// registrados em `registry.ts`; o que sobrou aqui e a superficie antiga —
// `SECOES`, `textoDaSecao`, `filtrarSecoes` e os tipos — servida agora pela
// visao de compatibilidade de `legado.ts`.
//
// POR QUE MANTER: `conteudo.test.ts` (F9→F18) roda sobre esta superficie sem
// uma linha alterada. Enquanto ele passar, esta provado que nenhuma frase do
// manual antigo se perdeu na reorganizacao. Codigo NOVO deve importar de
// `registry.ts` / `indice.ts` / `tipos.ts` — este arquivo e ponte, nao porta.
//
// Continua SO-SERVIDOR (o conteudo arrasta as constantes reais e o PapaParse).
export { SECOES, textoDaSecao, filtrarSecoes } from '@/lib/ajuda/legado'
export type { Bloco, Secao, Verbete, VerbeteMovimentacao } from '@/lib/ajuda/tipos'
