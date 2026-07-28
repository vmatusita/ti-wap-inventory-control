'use client'

import { useEffect } from 'react'
import { PainelErro } from '@/components/layout/painel-erro'

// Boundary do segmento (espelha `ativos/error.tsx`): as leituras de /itens são
// N+1 chamadas à RPC de saldos + o histórico, e qualquer uma que lance derrubava
// o shell inteiro (header e sidebar) na tela de erro global do Next. Aqui o erro
// degrada só o painel e o operador continua na aplicação.
//
// O "Tentar novamente" refaz DE VERDADE essas leituras (`unstable_retry`, Next
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
      titulo="Não foi possível carregar os itens"
      mensagem="Ocorreu um erro ao buscar os saldos e o histórico. Tente novamente."
      aoTentar={unstable_retry}
      reset={reset}
    />
  )
}
