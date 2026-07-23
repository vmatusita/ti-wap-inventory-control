// Resolucao da ancora da /ajuda (B3 — OS-F13). Funcao PURA: nada de DOM, nada
// de React, para caber no ambiente `node` do Vitest (igual a busca.ts).
//
// Por que existe: numa navegacao client-side com hash para OUTRA rota (o "?" das
// telas -> /ajuda#<ancora>), o App Router executa o scroll enquanto o loading.tsx
// da rota ainda esta na tela. As <section id="..."> nao existem, o Next rola ate
// a raiz do esqueleto, descarta o hash e nunca mais tenta (prova em
// scratchpad/f13/diag-ajuda.md). Quem sabe que as secoes existem e a propria
// pagina — e ela usa esta funcao para decidir para onde rolar.
//
// LISTA BRANCA obrigatoria: o hash vem da URL (entrada do usuario) e viraria um
// seletor de DOM. So devolvemos id que EXISTE em SECOES; qualquer outra coisa e
// `null` (= comportamento de hoje, ninguem rola nada).
//
// Casamento CASE-SENSITIVE de proposito: e a mesma regra de
// `document.getElementById` e do salto nativo de ancora do navegador. '#Itens'
// nao acha a secao 'itens' no browser, e aqui tambem nao acha — a alternativa
// (normalizar caixa) inventaria um comportamento que a URL escrita a mao nao tem
// quando aberta em aba nova. Decisao registrada em docs/DECISOES.md (23/07/2026).
export function resolverAncora(hash: string, ids: readonly string[]): string | null {
  const cru = hash.startsWith('#') ? hash.slice(1) : hash
  if (!cru) return null

  // Hash malformado ('#%E2') faz decodeURIComponent lancar URIError. Nesse caso
  // seguimos com o texto cru: ele so passa se casar com a lista branca.
  let alvo = cru
  try {
    alvo = decodeURIComponent(cru)
  } catch {
    alvo = cru
  }

  return ids.includes(alvo) ? alvo : null
}
