import 'server-only'
// `p_filial` das RPCs de relatório: a ponte entre "consolidado = NULL" e um tipo GERADO que
// não sabe disso.
//
// O PROBLEMA, medido em 30/07/2026 (F22). As sete RPCs `rel_*` recebem `p_filial smallint` e
// NÃO são `strict` (`proisstrict = false`, conferido nos dois bancos): passar NULL é o jeito
// oficial de pedir o relatório CONSOLIDADO — é o que a rota `/relatorios/geral` faz desde a
// F3, e o corpo de cada função trata `p_filial is null` explicitamente.
//
// O gerador de tipos do Supabase, porém, não distingue "aceita NULL" de "não aceita": ele
// emite `p_filial: number`. O `database.ts` commitado ainda trazia `number | null` porque foi
// gerado na F3/F3B, com uma versão antiga da CLI que emitia assim — e desde então
// `npm run db:types` vinha ABORTANDO por projeto não linkado (o script preserva o arquivo em
// caso de falha, de propósito), então a divergência ficou latente e invisível por meses. A
// primeira regeneração bem-sucedida a trouxe à tona, em oito pontos de chamada.
//
// AS ALTERNATIVAS, e por que não. (a) Editar `database.ts` à mão: é arquivo GERADO, o
// CLAUDE.md proíbe, e a edição sumiria na próxima regeneração. (b) Fixar uma CLI antiga o
// bastante para emitir `| null`: congelaria o gerador em uma versão anterior a várias fases do
// schema. (c) Trocar NULL por um sentinela (0, -1) nas chamadas: mudaria o COMPORTAMENTO do
// relatório consolidado — a pior opção, e a mais tentadora para quem só quer o build verde.
//
// Fica então um cast de FRONTEIRA, num lugar só, com o motivo escrito. Nenhum valor é
// transformado: `null` continua chegando `null` no Postgres.

/**
 * Passa a filial para uma RPC `rel_*`, preservando `null` (= consolidado).
 *
 * ⚠ Não use isto para "calar" um erro de tipo em qualquer RPC: vale só para as `rel_*`, cujo
 * corpo trata `p_filial is null`. Numa RPC que exija a filial, NULL é bug — e lá o tipo
 * estrito está certo.
 */
export function filialParaRpc(filialId: number | null): number {
  return filialId as unknown as number
}
