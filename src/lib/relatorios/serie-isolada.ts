// F32/RV-15 — isolar uma série (Saídas × Devoluções) pela legenda do gráfico de
// movimentações (`grafico-mov-serie.tsx`). Módulo separado de `calendario-serie.ts`
// porque ali a pergunta é "este balde merece um aviso de calendário" (fim de
// semana, hoje); aqui é "qual série o operador destacou nesta sessão de tela" —
// nada de data, nada de `Date.now()`, puro estado de interação.

export type SerieId = 'saidas' | 'devolucoes'

// Alterna a série isolada: clicar na já isolada RESTAURA (null) — sem isso o
// operador ficaria preso com uma série sempre isolada, sem jeito de voltar ao
// normal pelo mesmo gesto que isolou. Clicar na OUTRA série TROCA o isolamento
// (nunca as duas isoladas ao mesmo tempo): não existe leitura útil para "as duas
// atenuadas" — visualmente equivaleria a nenhuma isolada, só que sem devolver o
// estado `null` que o resto do componente (e a impressão) espera.
export function alternarSerieIsolada(atual: SerieId | null, clicada: SerieId): SerieId | null {
  return atual === clicada ? null : clicada
}

// Opacidade da série QUE NÃO foi clicada. Deliberadamente ABAIXO da opacidade do
// balde parcial (0,55 — `calendario-serie.ts`): isolar é uma ação do operador
// (ele clicou), então precisa ler mais forte na tela que o aviso passivo "hoje
// ainda enchendo" — os dois sinais compostos no mesmo retângulo (ver
// `opacidadeComposta` abaixo) continuam distinguíveis um do outro. Ainda longe de
// 0 porque a régua da fase (F32) é "nada some sem aviso": a barra atenuada
// continua com altura, cor e valor no tooltip — só perde destaque.
export const OPACIDADE_SERIE_ATENUADA = 0.25

// Opacidade final de UMA barra, compondo dois efeitos independentes que podem
// coincidir no MESMO retângulo: o balde de hoje (RV-05, já resolvido em
// `opacidadeBalde` — 0,55 ou 1) pode pertencer justamente à série que o operador
// isolou. Multiplicar (não `Math.min`) é como opacidades de camadas translúcidas
// realmente se empilham: o retângulo fica mais apagado quando os dois motivos se
// somam, em vez de travar no mais forte dos dois — o que apagaria a diferença
// entre "só balde de hoje" e "balde de hoje E série isolada", dois sinais que o
// leitor precisa conseguir distinguir (ex.: o operador isolou "Saídas" no dia em
// que o próprio balde de hoje é de saídas).
export function opacidadeComposta(opacidadeBalde: number, serieAtenuada: boolean): number {
  return serieAtenuada ? opacidadeBalde * OPACIDADE_SERIE_ATENUADA : opacidadeBalde
}
