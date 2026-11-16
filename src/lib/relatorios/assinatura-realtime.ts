// AS OPÇÕES DAS ASSINATURAS DE TEMPO REAL — uma função, três tabelas (F50).
//
// O `RealtimeRefresh` assina INSERT em três tabelas. Até a F50 cada `.on()` montava
// seu objeto de opções à mão, e os três eram idênticos exceto pelo nome da tabela.
// Isso não era problema enquanto não houvesse nada de escopo para dizer — e passa a
// ser no dia em que houver, porque três lugares divergem sozinhos.
//
// ---------------------------------------------------------------------------
// O FILTRO DE EMPRESA (F67B, 16/11/2026) — e o que ele NÃO é
// ---------------------------------------------------------------------------
// Até a F67B nenhum `filter:` era emitido: a F50 mediu que nenhum filtro por FILIAL era
// provadamente total (o consolidado precisa de toda filial; `anotacoes` não tinha
// `filial_id`, e `postgres_changes` não faz join). A régua que ela adotou continua:
// **não emitir filtro que não se consiga provar total**. Um filtro errado não dá erro —
// ele faz o canal parar de acordar, o selo "ao vivo" mente, e ninguém percebe.
//
// O filtro de EMPRESA é provadamente total: as três tabelas têm `empresa_id` (0160/0161),
// `not null`, e toda tela que monta o componente é de UMA empresa (a da operação). Por isso
// desde a F67B as três assinaturas emitem `filter: 'empresa_id=eq.<uuid>'`, com a empresa
// vinda do SERVIDOR (o Server Component a passa por prop — o componente é 'use client' e
// não a lê do navegador) e VALIDADA aqui: vazia ou malformada LANÇA, nunca vira um filtro
// que não casa nada.
//
// ⚠ O FILTRO NÃO É A SEGURANÇA. O Realtime não passa por `src/lib/queries`: ele fala direto
// com o Postgres pelo WebSocket do Supabase, e `postgres_changes` entrega o PAYLOAD DA
// LINHA ao navegador. Quem decide se um assinante recebe um INSERT é a policy de SELECT da
// tabela, que o Realtime confere POR ASSINANTE (doc oficial "Postgres Changes",
// conferida em 16/11/2026) — e o filtro do cliente é só redução de ruído: um navegador que
// tire o filtro recebe o que a RLS deixa, nada além. A trava de catálogo da publication
// (`supabase/tests/catalogo_policies.sql` §9: o conjunto congelado, a RLS ligada, o recorte
// de leitura de cada tabela e a replica identity que não é FULL — o DELETE não passa pela
// RLS no Realtime) é o que segura isso. Quando a empresa sair da SESSÃO (F70), muda só a
// origem da prop — nada aqui.

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

/** O que o `postgres_changes` recebe. Desde a F67B o `filter` de empresa vem SEMPRE. */
export type OpcoesAssinatura = {
  event: 'INSERT'
  schema: 'public'
  table: TabelaAssinada
  filter: string
}

/** uuid canônico, minúsculo (o que o banco devolve): nada de vírgula, operador ou segundo filtro escondido. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * As opções de assinatura de uma tabela: INSERT, schema `public`, e o filtro da EMPRESA (F67B).
 *
 * A empresa é a da operação, vinda do servidor por prop; uma empresa vazia ou fora da forma
 * LANÇA — o canal que não acorda em silêncio é pior que o erro que aparece no console.
 */
export function opcoesDaAssinatura(table: TabelaAssinada, empresaId: string): OpcoesAssinatura {
  if (!UUID.test(empresaId)) {
    throw new Error('assinatura de tempo real: a empresa precisa ser um uuid minúsculo (vinda do servidor).')
  }
  return { event: 'INSERT', schema: 'public', table, filter: `empresa_id=eq.${empresaId}` }
}
