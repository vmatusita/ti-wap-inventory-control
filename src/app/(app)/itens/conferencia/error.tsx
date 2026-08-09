'use client'

import { useEffect } from 'react'
import { PainelErro } from '@/components/layout/painel-erro'

// Boundary do segmento (espelha `itens/error.tsx`): a conferência lê os saldos
// da filial pela RPC, e uma falha ali derrubava o shell inteiro na tela de erro
// global do Next. Aqui o erro degrada só o painel.
//
// ⚠ O rascunho da conferência NÃO se perde neste caminho: ele vive no
// `sessionStorage` da aba, não no estado do React. Recarregar a página traz o
// banner "Continuar a conferência…" de volta com as contagens.
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
      titulo="Não foi possível abrir a conferência"
      mensagem="Ocorreu um erro ao buscar os saldos desta filial. Tente novamente — o que você já contou continua guardado nesta aba."
      aoTentar={unstable_retry}
      reset={reset}
    />
  )
}
