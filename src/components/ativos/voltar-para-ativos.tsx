'use client'

import type { MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

// F19 — "Voltar para ativos" preservando os filtros da lista (P2-12a). A ficha é
// Server Component e NÃO recebe os searchParams de /ativos, então a única pista de
// onde o operador veio está no histórico do navegador: quando ele veio da lista,
// `router.back()` devolve filtro, ordenação, scroll e paginação intactos.
//
// SEGURANÇA: o referrer só DECIDE entre `back()` e /ativos — nunca vira destino de
// navegação (isso seria open redirect). O href real continua sendo /ativos, então
// "abrir em nova aba", clique do meio e navegação sem JS seguem funcionando.
function veioDaListaDeAtivos(pathnameAtual: string) {
  const referrer = document.referrer
  if (!referrer) return false
  // Aba nova (ctrl/clique do meio na lista) tem referrer da lista mas nenhuma
  // entrada anterior: `back()` sairia do app ou não faria nada.
  if (window.history.length <= 1) return false
  try {
    const origem = new URL(referrer)
    if (origem.origin !== window.location.origin) return false
    // Recarregar a própria ficha mantém o referrer original — não é "voltar".
    if (origem.pathname === pathnameAtual) return false
    // Caminho EXATO, não `startsWith`: `/ativos/<outro-id>` é outra FICHA, e voltar
    // para ela contradiria o rótulo do link ("Voltar para ativos"). A querystring
    // fica fora do `pathname`, então `/ativos?filial=2&status=…` casa normalmente —
    // que é justamente o caso que este componente existe para preservar.
    return origem.pathname === '/ativos'
  } catch {
    // Referrer malformado: cai no caminho seguro (/ativos).
    return false
  }
}

export function VoltarParaAtivos() {
  const router = useRouter()
  const pathname = usePathname()

  function aoClicar(e: MouseEvent<HTMLAnchorElement>) {
    // Deixa o navegador cuidar de "abrir em nova aba/janela" (modificadores) —
    // nesses casos o href /ativos é o comportamento certo.
    if (e.defaultPrevented || e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!veioDaListaDeAtivos(pathname)) return
    e.preventDefault()
    router.back()
  }

  return (
    <Link
      href="/ativos"
      onClick={aoClicar}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Voltar para ativos
    </Link>
  )
}
