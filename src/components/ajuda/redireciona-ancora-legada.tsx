'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { resolverDestinoLegado } from '@/lib/ajuda/ancora'

// Compatibilidade das ancoras da ajuda de pagina unica (F6B→F19). Um favorito
// como /ajuda#movimentacoes precisa continuar levando o operador ao lugar certo
// depois da F20 — e o hash NAO chega ao servidor, entao quem redireciona e o
// indice, no cliente, no primeiro mount.
//
// A resolucao NAO e reimplementada aqui: chama `resolverDestinoLegado`, a mesma
// funcao pura coberta por `legado.test.ts`. (Na primeira versao desta fase o
// componente refazia o lookup a mao e o mapa vinha por prop; a revisao
// adversarial mostrou que a lista branca REALMENTE executada no navegador nao
// era a que os testes cobriam — e que `destinos['toString']` escapava dela. Um
// lugar so, e e o lugar testado.)
//
// `ancora.ts` e modulo PURO, sem import de servidor: por isso o cliente pode
// importa-lo, ao contrario de `registry.ts`/`legado.ts`.
//
// `router.replace`: o endereco antigo nao fica no historico, senao o botao
// Voltar entraria em pingue-pongue entre /ajuda#x e /ajuda/y.
export function RedirecionaAncoraLegada() {
  const router = useRouter()
  const jaFoi = useRef(false)

  useEffect(() => {
    if (jaFoi.current) return
    const destino = resolverDestinoLegado(window.location.hash)
    if (!destino) return
    jaFoi.current = true

    // Destino no PRÓPRIO índice (`#como-fazer` virou a categoria "Como fazer",
    // que é uma âncora daqui). `router.replace` para a mesma rota não rola a
    // página — então o salto é feito à mão, como o `AncoraAoMontar` faz.
    const [rota, ancora] = destino.split('#')
    if (rota === '/ajuda' && ancora) {
      window.history.replaceState(null, '', `#${ancora}`)
      document.getElementById(ancora)?.scrollIntoView()
      return
    }
    router.replace(destino)
  }, [router])

  return null
}
