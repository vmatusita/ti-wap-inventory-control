'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Atualização automática p/ sessão por SENHA (OS-F3 3.9.5): sem WebSocket
// (visualizador não tem credencial de banco), a página revalida sozinha a cada
// 60s + botão manual. Substitui o realtime do operador.
export function ViewerAutoRefresh() {
  const router = useRouter()
  const [pending, start] = useTransition()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(id)
  }, [router])

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => start(() => router.refresh())}
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
  )
}
