'use client'

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import {
  ATRIBUTO_SIDEBAR,
  CHAVE_SIDEBAR,
  leituraDoStorage,
  valorParaStorage,
  VALOR_RECOLHIDA,
} from '@/components/layout/sidebar-preferencia'

// UXG-13 (F30) — o estado compartilhado do colapso da sidebar.
//
// Precisa ser CONTEXTO, e não `useState` dentro da própria sidebar, porque quem
// alterna são dois lugares distantes um do outro: o botão do pé da sidebar e a
// tecla `[`, registrada no `atalho-global.tsx` junto de todos os outros atalhos
// globais. É o mesmo padrão do `ProgressoNavegacaoProvider` e do
// `PaletaComandosProvider`, montados no mesmo shell.
//
// A regra e o formato da preferência ficam em `sidebar-preferencia.ts` (puro,
// testado); aqui mora só a plumbing de React e DOM.

// A preferência é um estado EXTERNO ao React (mora no `localStorage`), então é
// lida por `useSyncExternalStore` e não por `useEffect` + `setState`: aquele
// caminho é uma renderização em cascata que o lint do projeto barra, e este é o
// que a documentação do React indica para exatamente este caso.
//
// De brinde vem a sincronia entre ABAS: o `storage` do navegador só dispara nas
// OUTRAS abas, então o `alternar()` avisa os ouvintes desta na mão. Duas abas do
// sistema abertas lado a lado passam a concordar sobre a sidebar.
const ouvintes = new Set<() => void>()

/** Escreve (ou apaga) o atributo do <html> — a chave do visual, ver `lerAgora`. */
function aplicarAtributo(recolhida: boolean): void {
  if (recolhida) document.documentElement.dataset[ATRIBUTO_SIDEBAR] = VALOR_RECOLHIDA
  else delete document.documentElement.dataset[ATRIBUTO_SIDEBAR]
}

function lerStorage(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_SIDEBAR)
  } catch {
    return null
  }
}

function assinar(aviso: () => void): () => void {
  // O `storage` só dispara nas OUTRAS abas — e o atributo do <html> é local a
  // cada uma delas. Sem reconciliar aqui, a aba que apenas OUVE ficaria com o
  // React dizendo "recolhida" (ele lê o storage no fallback) e o CSS mostrando o
  // menu inteiro: tooltip aparecendo sobre rótulo visível, `aria-expanded`
  // mentindo e o botão oferecendo "Expandir" um menu que está aberto.
  function aoMudarStorage(e: StorageEvent) {
    // `key === null` é `localStorage.clear()` — vale reconciliar também.
    if (e.key !== null && e.key !== CHAVE_SIDEBAR) return
    aplicarAtributo(leituraDoStorage(e.key === null ? lerStorage() : e.newValue))
    aviso()
  }
  ouvintes.add(aviso)
  window.addEventListener('storage', aoMudarStorage)
  return () => {
    ouvintes.delete(aviso)
    window.removeEventListener('storage', aoMudarStorage)
  }
}

function lerAgora(): boolean {
  // O atributo do <html> é a verdade da SESSÃO: o script inline o escreve a
  // partir do storage ANTES da pintura, e o `alternar()` o mantém. Ler dele — e
  // não do storage — é o que faz a coisa certa quando o storage está bloqueado
  // (a preferência não sobrevive ao reload, mas alternar continua funcionando)
  // e o que garante que React e CSS nunca discordem.
  if (document.documentElement.dataset[ATRIBUTO_SIDEBAR] === VALOR_RECOLHIDA) return true
  try {
    // Rede de segurança para o caso de o script inline não ter rodado (CSP de
    // um proxy corporativo, extensão que bloqueia inline script): a preferência
    // ainda é respeitada, só sem o anti-flash.
    return leituraDoStorage(window.localStorage.getItem(CHAVE_SIDEBAR))
  } catch {
    return false
  }
}

// No servidor não há preferência: renderiza-se SEMPRE expandida. É o que faz a
// hidratação bater — e o que o CSS do `data-sidebar` corrige antes da pintura
// para quem já tinha recolhido.
function lerNoServidor(): boolean {
  return false
}

type Contexto = {
  recolhida: boolean
  alternar: () => void
}

// Default no-op: `useSidebarColapso()` nunca lança fora do provider. Quem
// consome é o shell inteiro, e um throw derrubaria a árvore por causa de uma
// preferência cosmética.
const SidebarColapsoContext = createContext<Contexto>({
  recolhida: false,
  alternar: () => {},
})

export function SidebarColapsoProvider({ children }: { children: React.ReactNode }) {
  const recolhida = useSyncExternalStore(assinar, lerAgora, lerNoServidor)

  const alternar = useCallback(() => {
    const proxima = !lerAgora()
    try {
      window.localStorage.setItem(CHAVE_SIDEBAR, valorParaStorage(proxima))
    } catch {
      // Sem storage a preferência não sobrevive ao reload. O atributo abaixo
      // ainda alterna, então a sessão em curso funciona.
    }
    // O MESMO atributo que o script inline escreve: React e CSS têm de contar a
    // mesma história, senão o próximo reload volta ao estado antigo.
    aplicarAtributo(proxima)
    for (const aviso of ouvintes) aviso()
  }, [])

  return (
    <SidebarColapsoContext.Provider value={{ recolhida, alternar }}>
      {children}
    </SidebarColapsoContext.Provider>
  )
}

export function useSidebarColapso(): Contexto {
  return useContext(SidebarColapsoContext)
}
