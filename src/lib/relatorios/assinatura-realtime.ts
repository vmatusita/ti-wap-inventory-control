// AS OPÇÕES DAS ASSINATURAS DE TEMPO REAL — uma função, três tabelas (F50).
//
// O `RealtimeRefresh` assina INSERT em três tabelas. Até a F50 cada `.on()` montava
// seu objeto de opções à mão, e os três eram idênticos exceto pelo nome da tabela.
// Isso não era problema enquanto não houvesse nada de escopo para dizer — e passa a
// ser no dia em que houver, porque três lugares divergem sozinhos.
//
// ---------------------------------------------------------------------------
// POR QUE NENHUM `filter:` É EMITIDO HOJE — a decisão, e o que a sustenta
// ---------------------------------------------------------------------------
// A ficha da fase mandava "acrescentar `filter:` com o valor que hoje não recorta
// nada". Medido, isso não existe:
//
//   · A rota `relatorios/[filial]/page.tsx` serve o CONSOLIDADO (`geral`) e a filial
//     específica, e monta o MESMO `<RealtimeRefresh />` nos dois casos, sem prop
//     nenhuma. No consolidado, `filialId` é `null` e as consultas leem as cinco
//     filiais (`queries/relatorios/estoque.ts` só aplica `.eq('filial_id', …)` quando
//     há id). Essa tela PRECISA acordar com INSERT de qualquer filial.
//   · Duas das três montagens do componente nem são de relatório: são `/itens` e
//     `/itens/historico`, que mostram saldos de todas as filiais visíveis.
//   · `anotacoes` NÃO TEM `filial_id` (`0017_anotacoes.sql:6-13`). Ela se liga a uma
//     filial por `ativo_id → ativos.filial_id`, e `postgres_changes` não faz join:
//     o filtro dele é uma coluna da própria linha. Para essa tabela, um filtro por
//     filial é literalmente impossível hoje.
//
// A régua que a fase adotou: **não emitir filtro que não se consiga provar total**.
// Um filtro errado não dá erro — ele faz o canal parar de acordar, o selo "ao vivo"
// mente, e ninguém percebe por semanas. Uma string mágica do tipo `id=gt.0` seria
// exatamente isso: parece inofensiva, e ninguém consegue provar que é.
//
// Então o GANCHO entra sem literal: as três assinaturas passam a tirar suas opções
// desta função, que hoje devolve o objeto SEM `filter` e amanhã devolve COM. No dia
// da virada muda UMA linha, num lugar só, e as três a herdam.
//
// ⚠ E o aviso que precisa estar escrito, porque a virada vai supor o contrário:
// O REALTIME NÃO PASSA POR `src/lib/queries`. Ele fala direto com o Postgres pelo
// WebSocket do Supabase. Todo recorte que a virada puser na camada de queries —
// `empresa_id` em cada `select`, guarda em cada RPC — **não vale aqui**, porque este
// caminho não a atravessa. E `postgres_changes` entrega o PAYLOAD DA LINHA ao
// navegador, não um aviso de que algo mudou. A trava de verdade é RLS na publication
// `supabase_realtime`, que não existe hoje: é F70.

/** Uma tabela assinada e o que o canal precisa saber sobre ela. */
export type TabelaAssinada = 'movimentacoes' | 'lancamentos_item' | 'anotacoes'

/**
 * As três, em UM lugar. Assinar uma tabela nova é acrescentar aqui — e o teste
 * confere que o componente não monta nenhuma por fora desta lista.
 */
export const TABELAS_ASSINADAS: readonly TabelaAssinada[] = [
  'movimentacoes',
  'lancamentos_item',
  'anotacoes',
] as const

/** O que o `postgres_changes` recebe. `filter` é opcional e hoje nunca vem. */
export type OpcoesAssinatura = {
  event: 'INSERT'
  schema: 'public'
  table: TabelaAssinada
  filter?: string
}

/**
 * As opções de assinatura de uma tabela.
 *
 * Hoje: INSERT, schema `public`, sem `filter`. É o comportamento EXATO de antes da
 * F50 — o canal acorda com qualquer inserção nas três tabelas, que é o que as telas
 * consolidadas precisam.
 *
 * Depois da virada: é aqui que o `filter` de escopo entra, uma vez, para as três.
 */
export function opcoesDaAssinatura(table: TabelaAssinada): OpcoesAssinatura {
  return { event: 'INSERT', schema: 'public', table }
}
