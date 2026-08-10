'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { carimboAtualizado } from '@/lib/relatorios/carimbo-hora'

// Atualização automática p/ sessão por SENHA (OS-F3 3.9.5): sem WebSocket
// (visualizador não tem credencial de banco), a página revalida sozinha a cada
// 60s + botão manual. Substitui o realtime do operador.
export function ViewerAutoRefresh() {
  const router = useRouter()
  const [pending, start] = useTransition()
  // RV-16 — mesma armadilha de hidratação do RealtimeRefresh (ver comentário
  // lá): nasce vazio, só ganha valor dentro do efeito, que roda depois do
  // mount e só no navegador — servidor e primeiro render do cliente
  // concordam em "nada visível ainda".
  const [carimbo, setCarimbo] = useState('')

  useEffect(() => {
    // RV-16 — mesmo padrão da casa do RealtimeRefresh (ver comentário lá):
    // `setTimeout(…, 0)` empurra o `setState` inicial para dentro de um
    // callback, e não para o corpo síncrono do efeito
    // (`react-hooks/set-state-in-effect`).
    const tCarimbo = setTimeout(() => setCarimbo(carimboAtualizado(Date.now())), 0)
    const id = setInterval(() => {
      router.refresh()
      setCarimbo(carimboAtualizado(Date.now()))
    }, 60_000)
    return () => {
      clearTimeout(tCarimbo)
      clearInterval(id)
    }
  }, [router])

  return (
    <span className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() =>
          start(() => {
            router.refresh()
            setCarimbo(carimboAtualizado(Date.now()))
          })
        }
        disabled={pending}
        title="Atualiza sozinho a cada 60 segundos"
      >
        {/* F19 — quem pediu menos movimento no sistema não gira o ícone; o texto
            "Atualizando…" ao lado já é o estado, então nada se perde. */}
        <RefreshCw
          className={pending ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'}
        />
        {pending ? 'Atualizando…' : 'Atualizar'}
      </Button>
      {/* RV-16 — texto PERSISTENTE ao lado do botão, não só o `title` de hover
          (teclado/toque não alcançam `title`; o `title` fica como reforço,
          não como único canal). Sem `print:hidden` de propósito: o carimbo
          entra no papel — a regra transversal da ordem só manda `print:hidden`
          para elemento SÓ-de-navegação novo, e isto não navega nada. */}
      {carimbo && (
        <span className="text-xs text-muted-foreground">{carimbo}</span>
      )}
    </span>
  )
}
