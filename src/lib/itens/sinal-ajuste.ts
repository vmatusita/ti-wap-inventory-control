// ITN-05b — o teclado numérico do iOS não tem tecla de menos: no lançamento de
// tipo Ajuste, "baixar 3" era literalmente indigitável em boa parte dos
// celulares. A UI passa a ter um alternador por linha ("+ Acrescentar" / "−
// Baixar") que decide o sinal; o campo de quantidade só recebe o MÓDULO (o
// valor sem sinal). Funções puras — a decisão do sinal não muda a validação
// existente (`erroQuantidadeLancamento`, validators/item.ts): o alternador só
// evita a digitação do "-", não altera a regra de negócio.

export type SentidoAjuste = 'positivo' | 'negativo'

export const ROTULO_ACRESCENTAR = '+ Acrescentar'
export const ROTULO_BAIXAR = '− Baixar'

/** O que o campo mostra: o módulo (sem sinal de abertura), pronto para o
 *  teclado numérico do iOS. Vazio continua vazio (nada digitado ainda). */
export function moduloDeQuantidade(quantidade: string): string {
  return quantidade.trim().replace(/^-/, '')
}

/** Sentido atual de uma quantidade já armazenada (para o `aria-pressed` do
 *  alternador refletir o que está na linha). Vazio/positivo → "positivo", que
 *  é também o padrão de uma linha nova. */
export function sentidoDeQuantidade(quantidade: string): SentidoAjuste {
  return quantidade.trim().startsWith('-') ? 'negativo' : 'positivo'
}

/** Aplica o sentido escolhido sobre o módulo digitado, devolvendo a string que
 *  vai para `LinhaCarrinho.quantidade` (o contrato do carrinho não muda: ainda
 *  é uma string, só vira `Number()` em `salvar()`).
 *
 *  `modulo` pode chegar já com um "-" — um valor negativo colado pelo
 *  operador direto no campo, por exemplo — e é tratado pelo VALOR ABSOLUTO: o
 *  sinal final é sempre o do alternador, nunca o do que foi digitado ou
 *  colado. Zero nunca ganha sinal (não existe "-0" na tela; o Zod recusa
 *  ajuste igual a zero de qualquer forma — `erroQuantidadeLancamento`). */
export function aplicarSinal(modulo: string, sentido: SentidoAjuste): string {
  const semSinal = moduloDeQuantidade(modulo)
  if (semSinal === '' || /^0+$/.test(semSinal)) return semSinal
  return sentido === 'negativo' ? `-${semSinal}` : semSinal
}
