'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Boundary do SEGMENTO (espelha `ativos/error.tsx`). Sem ele, qualquer `throw`
// de `listarMovimentacoes` sobe até o boundary global do Next e substitui o
// documento inteiro — o operador perde header e sidebar, não só este painel.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="font-medium">Não foi possível carregar as movimentações</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro ao buscar os dados. Tente novamente.
      </p>
      <Button onClick={reset} variant="outline">
        Tentar novamente
      </Button>
    </div>
  )
}
