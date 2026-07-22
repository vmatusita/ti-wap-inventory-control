'use client'

// Base fresca para montar a próxima URL de filtro de /itens (OS-F9 · achado da
// revisão adversarial).
//
// O problema: `useSearchParams()` só reflete a URL COMMITADA — e
// `window.location.search` também, porque o Next só chama `history.pushState`
// dentro do `useInsertionEffect` do `HistoryUpdater`, quando a navegação
// termina (conferido em `node_modules/next/dist/client/components/app-router.js`).
// Como cada troca de filtro navega dentro de `startTransition`, duas trocas na
// mesma janela pendente liam o mesmo snapshot antigo e a segunda apagava a
// primeira — dentro do mesmo bloco (De → Até) e também ENTRE os dois blocos de
// filtro de /itens, que empurram para a mesma URL.
//
// A solução: guardar o último conjunto empurrado. Enquanto a URL commitada for
// a mesma de quando empurramos, a navegação ainda não terminou e a base correta
// é o que empurramos. Assim que a URL commitada muda — porque o nosso push
// chegou ou porque veio navegação de fora (back/forward, link) — a base volta a
// ser a URL de verdade.
let pendente: { commitadaAntes: string; enviada: string } | null = null

// Base para montar a próxima URL. `urlCommitada` é `useSearchParams().toString()`.
export function baseFiltrosItens(urlCommitada: string): URLSearchParams {
  if (pendente && pendente.commitadaAntes === urlCommitada) {
    return new URLSearchParams(pendente.enviada)
  }
  pendente = null
  return new URLSearchParams(urlCommitada)
}

// Registra o que foi empurrado, para a próxima troca partir daqui.
export function registrarFiltrosEnviados(urlCommitada: string, enviada: string): void {
  pendente = { commitadaAntes: urlCommitada, enviada }
}

// Só para teste — o módulo guarda estado entre chamadas por natureza.
export function resetarFiltrosPendentes(): void {
  pendente = null
}
