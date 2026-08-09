// Gatilho "transferir a partir desta célula" (F31 · ITN-01). Espelha
// `lancar-item-evento.ts`: a tabela de saldos por filial é server-rendered, e em
// vez de subi-la inteira para o client cada célula ganha um botão client mínimo
// que dispara este CustomEvent — o `TransferirItemDialog` (já client) escuta,
// abre e aplica o preset.
//
// ⚠ A DIFERENÇA para o "+" do lançamento, e ela é de propósito: lá o botão é da
// LINHA e NÃO manda filial (o "+" vale para todas as colunas, e escolher uma por
// conta própria gravaria no lugar errado em silêncio). Aqui o atalho é da
// CÉLULA, porque a célula É a informação que falta: ela diz de qual filial o
// item vai SAIR. O destino continua em branco — esse ninguém pode adivinhar.
export const EVENTO_TRANSFERIR_ITEM = 'wap:transferir-item'

export type TransferirItemDetalhe = {
  /** Item a pré-selecionar. `null` = abrir vazio (botão do cabeçalho). */
  itemId: number | null
  /** Filial de ORIGEM — a coluna em que o operador clicou. */
  origemId: number | null
}

declare global {
  interface WindowEventMap {
    'wap:transferir-item': CustomEvent<TransferirItemDetalhe>
  }
}

export function dispararTransferirItem(detail: TransferirItemDetalhe): void {
  window.dispatchEvent(new CustomEvent(EVENTO_TRANSFERIR_ITEM, { detail }))
}
