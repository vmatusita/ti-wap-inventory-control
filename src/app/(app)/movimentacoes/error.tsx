'use client'

import { useEffect } from 'react'
import { PainelErro } from '@/components/layout/painel-erro'

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
  unstable_retry?: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <PainelErro
      titulo="Não foi possível carregar as movimentações"
      mensagem="Ocorreu um erro ao buscar os dados. Tente novamente."
      aoTentar={unstable_retry}
      reset={reset}
    />
  )
}
