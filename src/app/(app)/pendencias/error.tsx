'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { PainelErro } from '@/components/layout/painel-erro'

// Boundary do segmento (espelha `itens/error.tsx` e `ativos/error.tsx`).
// /pendencias faz três leituras (filiais, chips e a lista da v_pendencias) e
// qualquer uma que lance subia até o boundary global do Next, trocando o
// APLICATIVO INTEIRO — header e sidebar inclusive — pela tela de erro genérica.
// Aqui o erro degrada só o painel e o operador continua na aplicação, com os
// filtros ainda visíveis na URL. (Achado F12-W4-01.)
//
// O "Tentar novamente" refaz DE VERDADE as três leituras (`unstable_retry`, Next
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
      titulo="Não foi possível carregar as pendências"
      mensagem="Ocorreu um erro ao buscar a lista. Tente novamente ou limpe os filtros da busca."
      aoTentar={unstable_retry}
      reset={reset}
    >
      {/* `<a>` e não `<Link>`: o boundary precisa de uma navegação que TROQUE a
          URL. O "Tentar novamente" refaz as leituras, mas com os MESMOS
          searchParams — se o erro veio de um param da URL, ele refalha sempre,
          por mais que o operador clique. Esta é a saída que funciona. */}
      <Button asChild variant="ghost">
        <a href="/pendencias">Limpar filtros</a>
      </Button>
    </PainelErro>
  )
}
