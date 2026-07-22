// Gatilho "lançar da linha" (OS-F9 · I6). A tabela de saldos é server-rendered;
// para não subi-la inteira para o client, cada linha ganha só um botão client
// mínimo que dispara este CustomEvent na window — o LancarItemDialog (já client,
// já com listener de teclado para o atalho `L`) escuta, abre e aplica o preset.
export const EVENTO_LANCAR_ITEM = 'wap:lancar-item'

export type LancarItemDetalhe = {
  itemId: number
  /** Filial do filtro atual; null no consolidado (o dialog mantém a que está). */
  filialId: number | null
}

declare global {
  interface WindowEventMap {
    'wap:lancar-item': CustomEvent<LancarItemDetalhe>
  }
}

export function dispararLancarItem(detail: LancarItemDetalhe): void {
  window.dispatchEvent(new CustomEvent(EVENTO_LANCAR_ITEM, { detail }))
}
