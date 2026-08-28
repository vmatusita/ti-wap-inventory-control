// O texto da justificativa do acerto de contagem que a BAIXA de uma pendência de
// item gera (F38 · §E).
//
// POR QUE ISTO É UM MÓDULO, E NÃO UMA LINHA DENTRO DA FUNÇÃO SQL. O `ajuste`
// negativo da baixa precisa de `observacao` não vazia — é o CHECK
// `lanc_item_ajuste_obs` (0015). A tentação é compor a frase dentro de
// `resolver_pendencias_item_com_lancamentos`. O cabeçalho da 0104 já explicou por
// que não: "Se a frase morasse aqui, o selo do histórico teria de repeti-la em
// TypeScript — duas cópias da mesma string, em linguagens diferentes, que divergem
// no primeiro `create or replace`."
//
// A observação da RESOLUÇÃO, quando o operador escreveu uma, é a justificativa. Só
// quando ela vem vazia é que o texto padrão entra — e ele diz o que de fato
// aconteceu, com o item e a pessoa nomeados, para quem ler o diário daqui a um ano
// entender sem abrir a pendência.

/** Teto de `lancamentos_item.observacao` (0015 e o Zod de item). */
const TETO_OBSERVACAO = 500

/** O começo do texto padrão — é por ele que o histórico se reconhece. */
export const PREFIXO_BAIXA = 'Baixa de item faltante'

export type ContextoBaixa = {
  /** O rótulo do tipo ("Fone de ouvido"), ou o slug cru quando não há tipo. */
  itemRotulo: string
  /** O nome de quem estava com o item, do jeito que a pendência guardou. */
  colaborador?: string | null
  /** A observação que o operador escreveu ao resolver, se escreveu. */
  observacaoDaResolucao?: string | null
}

/**
 * A justificativa do `ajuste` negativo da baixa. NUNCA devolve vazio — o CHECK do
 * banco não aceitaria, e a mensagem de recusa seria pior que o texto padrão.
 */
export function textoDaBaixa(ctx: ContextoBaixa): string {
  const escrito = ctx.observacaoDaResolucao?.trim()
  if (escrito) return escrito.slice(0, TETO_OBSERVACAO)

  const item = ctx.itemRotulo?.trim() || 'item'
  const pessoa = ctx.colaborador?.trim()
  const comQuem = pessoa ? ` (estava com ${pessoa})` : ''
  return `${PREFIXO_BAIXA}: ${item}${comQuem} — não vai voltar.`.slice(0, TETO_OBSERVACAO)
}

/**
 * A observação do `retorno` que acompanha os dois desfechos. É opcional no banco
 * (só o `ajuste` exige texto), e existe para que a linha do diário se explique
 * sozinha: sem ela, um `retorno` solto no meio do histórico não diz de onde veio.
 */
export function textoDoRetornoDaPendencia(
  desfecho: 'recuperado' | 'baixa',
  ctx: ContextoBaixa,
): string {
  const item = ctx.itemRotulo?.trim() || 'item'
  const pessoa = ctx.colaborador?.trim()
  const comQuem = pessoa ? ` com ${pessoa}` : ''
  const frase =
    desfecho === 'recuperado'
      ? `Pendência resolvida: ${item}${comQuem} foi recuperado.`
      : `Pendência resolvida: ${item}${comQuem} recebeu baixa.`
  return frase.slice(0, TETO_OBSERVACAO)
}
