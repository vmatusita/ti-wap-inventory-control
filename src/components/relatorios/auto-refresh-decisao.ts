// A DECISÃO DO AUTO-REFRESH DO VISUALIZADOR, em função PURA (F50).
//
// Módulo PURO (sem React, sem DOM, sem `'use client'`): é o que o
// `viewer-auto-refresh.tsx` consome e o que o teste alcança. O Vitest deste
// repositório roda em `node` nos DOIS projetos — não há jsdom, e acrescentá-lo seria
// dependência nova, que a regra 3 do CLAUDE.md proíbe. Sem extrair a regra, a única
// prova possível seria uma asserção de texto sobre o fonte ("o arquivo menciona
// `visibilityState`"), que confirma a grafia e não o comportamento.
//
// Mesmo padrão de `layout/sidebar-preferencia.ts` e `itens/conferencia/rascunho.ts`.
//
// ---------------------------------------------------------------------------
// O QUE ESTA REGRA RESOLVE
// ---------------------------------------------------------------------------
// O visualizador por senha não tem credencial de banco, então não abre WebSocket: a
// página se revalida sozinha a cada 60 s. Só que ela se revalidava SEMPRE — inclusive
// numa aba esquecida atrás de outras vinte, a noite inteira, e a rota de relatório é
// a mais cara do sistema (o snapshot lê acervo, movimentações, itens e pendências do
// período). Ninguém estava olhando; o Supabase Free, sim.
//
// Três regras, e a ordem entre elas importa:
//   1. aba OCULTA não refresca — ninguém está lendo;
//   2. ao VOLTAR, refresca uma vez SE o intervalo já tinha vencido enquanto oculta —
//      senão a pessoa olharia dado velho esperando o próximo ciclo;
//   3. nunca enfileira refresh atrás de refresh — o manual, o do intervalo e o da
//      volta à aba podem coincidir, e três `router.refresh()` seguidos custam três
//      renderizações da rota mais cara para mostrar a mesma tela.
//
// ⚠ Quem está COM A ABA ABERTA não percebe diferença nenhuma, e é assim que esta
// mudança cabe numa fase que não muda comportamento: o ciclo de 60 s continua igual
// para quem está lendo. O que sumiu foi o trabalho feito para ninguém.

/** O intervalo de revalidação da tela do visualizador. */
export const INTERVALO_REFRESH_MS = 60_000

export type EstadoRefresh = {
  /** Agora, em ms (`Date.now()`). */
  agora: number
  /** Quando o último refresh aconteceu, em ms. */
  ultimo: number
  /** `document.visibilityState === 'visible'`. */
  visivel: boolean
  /** Já existe um refresh em voo (o `isPending` do `useTransition`). */
  emVoo: boolean
  /** Quanto tempo precisa ter passado. Default: `INTERVALO_REFRESH_MS`. */
  intervalo?: number
}

/**
 * Deve refrescar agora?
 *
 * A ordem dos testes é a ordem das regras: `emVoo` vence tudo (coalesce), depois a
 * visibilidade (pausa), e só então o relógio (vencimento). Inverter os dois primeiros
 * deixaria uma aba oculta enfileirar trabalho para quando voltasse a aparecer.
 */
export function deveRefrescar({
  agora,
  ultimo,
  visivel,
  emVoo,
  intervalo = INTERVALO_REFRESH_MS,
}: EstadoRefresh): boolean {
  if (emVoo) return false
  if (!visivel) return false
  return agora - ultimo >= intervalo
}
