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
  const alvo = decodificarHash(hash)
  return alvo !== null && ids.includes(alvo) ? alvo : null
}

// Hash malformado ('#%E2') faz decodeURIComponent lancar URIError. Nesse caso
// seguimos com o texto cru: ele so passa se casar com a lista branca.
function decodificarHash(hash: string): string | null {
  const cru = hash.startsWith('#') ? hash.slice(1) : hash
  if (!cru) return null
  try {
    return decodeURIComponent(cru)
  } catch {
    return cru
  }
}

// ---------------------------------------------------------------------------
// COMPATIBILIDADE DAS ANCORAS DA AJUDA DE PAGINA UNICA (F6B→F19)
// ---------------------------------------------------------------------------
// Mora AQUI, e nao em `legado.ts`, por um motivo de arquitetura: quem
// redireciona e o CLIENTE (o hash nunca chega ao servidor), e `legado.ts`
// importa o registry, que e so-servidor. Este modulo e puro — o mesmo motivo
// pelo qual `resolverAncora` ja vivia nele.
//
// LINHA NUNCA SE REMOVE DESTE MAPA: cada id e um endereco que ainda existe em
// favorito, historico de navegador e link colado em chamado.
export const DESTINO_LEGADO: Readonly<Record<string, string>> = {
  conceito: '/ajuda/conceito-movimentacao',
  status: '/ajuda/status-do-ativo',
  movimentacoes: '/ajuda/tipos-de-movimentacao',
  termos: '/ajuda/termos-de-responsabilidade',
  itens: '/ajuda/itens-por-quantidade',
  pendencias: '/ajuda/resolver-pendencias',
  relatorios: '/ajuda/relatorio-ao-vivo',
  // A secao "Como fazer" virou uma CATEGORIA inteira: o destino honesto e a
  // lista dos guias no indice, nao um guia escolhido a dedo.
  'como-fazer': '/ajuda#fazer',
  admin: '/ajuda/administracao',
  acesso: '/ajuda/acesso-e-sessoes',
}

/**
 * Resolve o hash de uma URL antiga para o endereço novo. PURA e com LISTA
 * BRANCA: hash desconhecido devolve `null` (= não redireciona nada), que é o
 * comportamento seguro. Casamento case-sensitive de propósito, igual ao salto
 * nativo de âncora do navegador (decisão F13, mantida).
 *
 * `hasOwnProperty`, e não `mapa[alvo]`: acesso direto herda o Object.prototype,
 * então `#toString`, `#constructor` e `#__proto__` devolveriam uma FUNÇÃO
 * (truthy) e quem chamasse `.split('#')` nela derrubaria a tela. Achado da
 * revisão adversarial da F20.
 */
export function resolverDestinoLegado(hash: string): string | null {
  const alvo = decodificarHash(hash)
  if (alvo === null) return null
  return Object.prototype.hasOwnProperty.call(DESTINO_LEGADO, alvo)
    ? DESTINO_LEGADO[alvo]
    : null
}
