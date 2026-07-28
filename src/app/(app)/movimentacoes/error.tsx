'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { TentarNovamente } from '@/components/layout/tentar-novamente'

// Boundary do SEGMENTO (espelha `ativos/error.tsx`). Sem ele, qualquer `throw`
// de `listarMovimentacoes` sobe até o boundary global do Next e substitui o
// documento inteiro — o operador perde header e sidebar, não só este painel.
//
// O "Tentar novamente" refaz DE VERDADE a leitura (`unstable_retry`, Next
// ≥ 16.2) — antes era `reset()` puro e o clique não fazia nada (F20B).
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
      <p className="font-medium">Não foi possível carregar as movimentações</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro ao buscar os dados. Tente novamente.
      </p>
      <TentarNovamente aoTentar={unstable_retry} reset={reset} />
    </div>
  )
}
