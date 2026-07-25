'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Compatibilidade das ancoras da ajuda de pagina unica (F6B→F19). Um favorito
// como /ajuda#movimentacoes precisa continuar levando o operador ao lugar certo
// depois da F20 — e o hash NAO chega ao servidor, entao quem redireciona e o
// indice, no cliente, no primeiro mount.
//
// O MAPA vem por prop porque `legado.ts` importa o registry (so-servidor, arrasta
// PapaParse) — mesmo motivo pelo qual `AncoraAoMontar` recebe os ids por prop.
// E ele e a LISTA BRANCA: hash desconhecido nao redireciona nada, e o operador
// simplesmente fica no indice.
//
// `router.replace`: o endereco antigo nao fica no historico, senao o botao
// Voltar entraria em pingue-pongue entre /ajuda#x e /ajuda/y.
export function RedirecionaAncoraLegada({
  destinos,
}: {
  destinos: Readonly<Record<string, string>>
}) {
  const router = useRouter()
  const jaFoi = useRef(false)

  useEffect(() => {
    if (jaFoi.current) return
    const hash = window.location.hash
    if (!hash) return
    const cru = hash.slice(1)
    let alvo = cru
    try {
      alvo = decodeURIComponent(cru)
    } catch {
      alvo = cru
    }
    const destino = destinos[alvo]
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
  }, [destinos, router])

  return null
}
