'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Boundary do segmento (espelha `itens/error.tsx` e `ativos/error.tsx`).
// /pendencias faz três leituras (filiais, chips e a lista da v_pendencias) e
// qualquer uma que lance subia até o boundary global do Next, trocando o
// APLICATIVO INTEIRO — header e sidebar inclusive — pela tela de erro genérica.
// Aqui o erro degrada só o painel e o operador continua na aplicação, com os
// filtros ainda visíveis na URL. (Achado F12-W4-01.)
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
      <p className="font-medium">Não foi possível carregar as pendências</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro ao buscar a lista. Tente novamente ou limpe os filtros da
        busca.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset} variant="outline">
          Tentar novamente
        </Button>
        {/* `<a>` e não `<Link>`: o boundary precisa de uma navegação que TROQUE
            a URL. O "Tentar novamente" re-renderiza o mesmo segmento com os
            mesmos searchParams — se o erro veio de um param da URL, ele refalha
            para sempre. Esta é a saída que funciona. */}
        <Button asChild variant="ghost">
          <a href="/pendencias">Limpar filtros</a>
        </Button>
      </div>
    </div>
  )
}
