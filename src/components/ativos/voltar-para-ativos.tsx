'use client'

import type { MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { lerListaDeAtivos } from '@/components/ativos/lista-visitada'

// F19 (P2-12a) — "Voltar para ativos" devolvendo o operador ao filtro que ele
// montou. Quem filtrou "notebooks da Matriz em manutenção", abriu uma ficha e
// voltou, refazia o filtro inteiro.
//
// A ficha é Server Component e NÃO recebe os searchParams da lista, então a URL
// filtrada precisa vir de outro lugar. O primeiro desenho usava
// `document.referrer` + `router.back()`, como a ordem sugeria — mas isso NÃO
// funciona: no App Router a navegação da lista para a ficha é soft
// (`history.pushState`), e `pushState` não atualiza o `document.referrer`. A
// checagem daria `false` no fluxo normal e o botão viraria o link fixo de antes,
// em silêncio. Achado da revisão adversarial; ver docs/DECISOES.md.
//
// Agora a própria lista grava sua URL em `sessionStorage` (`LembrarLista`) e aqui
// nós a lemos NO CLIQUE — nunca no render, que quebraria a hidratação. O
// `href="/ativos"` real continua por baixo: sem JS, com "abrir em nova aba" ou
// sem nada gravado, o comportamento é o de sempre.
export function VoltarParaAtivos() {
  const router = useRouter()

  function aoClicar(e: MouseEvent<HTMLAnchorElement>) {
    // Modificadores e clique não-primário são do navegador (nova aba/janela) —
    // nesses casos o href /ativos é exatamente o certo.
    if (e.defaultPrevented || e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

    // `lerListaDeAtivos` já valida que é caminho relativo da própria lista.
    const destino = lerListaDeAtivos()
    if (!destino || destino === '/ativos') return

    e.preventDefault()
    router.push(destino)
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
