'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { lembrarListaDeAtivos } from '@/components/ativos/lista-visitada'

// F19 (P2-12a) — grava a URL COMPLETA da lista (com filtros, ordenação e página)
// para o "Voltar para ativos" da ficha ter para onde voltar. Não renderiza nada.
//
// Efeito é o lugar certo: escrever em `sessionStorage` é sincronizar com um
// sistema externo, não estado de React. Roda de novo a cada mudança de filtro
// porque `useSearchParams` muda com a querystring.
export function LembrarLista() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    lembrarListaDeAtivos(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, searchParams])

  return null
}
