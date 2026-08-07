// Peso visual da IDADE de uma pendência (F28/PND-04). A fila ordena da mais antiga
// para a mais nova, mas "há 2 dias" e "há 94 dias" ficavam no mesmo cinza — os
// limiares abaixo dão à idade um segundo canal (badge âmbar/vermelho na tabela), no
// molde de `relatorios/manutencao-alerta.ts` (MANUTENCAO_ALERTA_DIAS).

// Limiares em dias. Constantes nomeadas (não número mágico solto na UI).
export const PENDENCIA_ATENCAO_DIAS = 30
export const PENDENCIA_CRITICA_DIAS = 90

export type FaixaIdadePendencia = 'nova' | 'atencao' | 'critica'

// Decide a faixa a partir de quantos dias a pendência está aberta — o mesmo número
// que já alimenta o "desdeRel" calculado no Server Component (`pendencias/page.tsx`;
// nada de `new Date()` no cliente, para não arriscar mismatch de hidratação).
//
// Os limiares são EXCLUSIVOS ("acima de", não "a partir de"): no dia exato do
// limiar a pendência AINDA está na faixa de baixo — só o dia SEGUINTE sobe de
// faixa. 30 dias é 'nova'; só 31 vira 'atencao'. 90 dias é 'atencao'; só 91 vira
// 'critica'. Testado nas bordas (29/30/31 e 89/90/91) em idade.test.ts.
//
// `dias` nulo (sem data de abertura conhecida) é sempre 'nova': sem informação não
// há como alertar.
export function faixaIdadePendencia(dias: number | null): FaixaIdadePendencia {
  if (dias == null) return 'nova'
  if (dias > PENDENCIA_CRITICA_DIAS) return 'critica'
  if (dias > PENDENCIA_ATENCAO_DIAS) return 'atencao'
  return 'nova'
}
