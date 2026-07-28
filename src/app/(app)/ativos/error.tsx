'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { TentarNovamente } from '@/components/layout/tentar-novamente'

// O "Tentar novamente" refaz DE VERDADE as leituras deste segmento — usa a prop
// `unstable_retry` (Next ≥ 16.2). Antes chamava `reset()` puro, que só limpava o
// estado de erro sem refazer as leituras de Server Component: o operador clicava
// e nada acontecia (F20B). A mecânica mora em `TentarNovamente`.
export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="font-medium">Não foi possível carregar os ativos</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro ao buscar os dados. Tente novamente.
      </p>
      <TentarNovamente aoTentar={unstable_retry} reset={reset} />
    </div>
  )
}
