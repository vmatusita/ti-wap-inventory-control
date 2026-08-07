// Rótulos em pt-BR das chaves de `PreviaReset.contagens` (F27/B8 — DEV-02).
//
// ⚠ DE ONDE VÊM AS CHAVES. `previa_reset` (migration 0086) devolve `contagens` no MESMO
// formato que `resetar_acervo`/`resetar_itens` (migration 0083) exigem em `p_contagens` — as
// seis chaves que essas três RPCs conhecem hoje são exatamente as do mapa abaixo: `ativos`,
// `movimentacoes`, `anotacoes`, `pendencias_item`, `termos` (bloco "acervo") e `lancamentos`
// (bloco "itens").
//
// ⚠ POR QUE UM MAPA FIXO, E NÃO SÓ `chave.replace(/_/g, ' ')`. O replace continua aqui — como
// FALLBACK — porque ele nunca falha: qualquer chave nova vira algo legível. Mas "legível" não é
// "certo": `pendencias_item` virava "pendencias item" (sem acento, sem preposição) e
// `lancamentos` virava "lancamentos" (sem acento, sem "de item"), na Zona destrutiva — a tela
// que existe para a pessoa ler com atenção ANTES de confirmar uma exclusão sem volta. As seis
// chaves conhecidas merecem o rótulo curado; uma chave nova (uma sétima coluna que uma migration
// futura acrescente a `p_contagens`) cai no replace — feio, mas nunca ausente. Mesma doutrina da
// REDE PERMANENTE de `src/lib/validators/dev-integridade.ts` (DEV-01), aplicada aqui ao reset.
export const ROTULOS_CONTAGEM_RESET: Record<string, string> = {
  ativos: 'ativos',
  movimentacoes: 'movimentações',
  anotacoes: 'anotações',
  pendencias_item: 'pendências de item',
  termos: 'termos',
  lancamentos: 'lançamentos de item',
}

/**
 * O rótulo em pt-BR de uma chave de `contagens`: o nome curado quando a chave é conhecida, ou
 * `chave.replace(/_/g, ' ')` como fallback para uma chave nova.
 */
export function rotuloContagemReset(chave: string): string {
  return ROTULOS_CONTAGEM_RESET[chave] ?? chave.replace(/_/g, ' ')
}
