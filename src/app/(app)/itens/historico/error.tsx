'use client'

import { useEffect } from 'react'
import { PainelErro } from '@/components/layout/painel-erro'

// Boundary do segmento (espelha `itens/error.tsx`): a leitura do histórico é uma
// consulta paginada mais, no caso raro de 1 item + 1 filial, a do "Saldo após".
// Se qualquer uma lançar, o erro degrada só o painel — o header e a sidebar
// continuam de pé e o operador segue na aplicação.
//
// O "Tentar novamente" refaz DE VERDADE a leitura (`unstable_retry`, Next ≥ 16.2)
// — `reset()` puro não fazia nada (F20B).
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
      titulo="Não foi possível carregar o histórico"
      mensagem="Ocorreu um erro ao buscar os lançamentos de itens. Tente novamente."
      aoTentar={unstable_retry}
      reset={reset}
    />
  )
}
