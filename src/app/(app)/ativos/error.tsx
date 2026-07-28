'use client'

import { useEffect } from 'react'
import { PainelErro } from '@/components/layout/painel-erro'

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
  // Opcional porque é assim que `TentarNovamente` a trata: a API ainda é
  // `unstable_` e, se um minor do Next a renomear, ela chega `undefined` aqui.
  unstable_retry?: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <PainelErro
      titulo="Não foi possível carregar os ativos"
      mensagem="Ocorreu um erro ao buscar os dados. Tente novamente."
      aoTentar={unstable_retry}
      reset={reset}
    />
  )
}
