'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Boundary do segmento (espelha `ativos/error.tsx`): as leituras de /itens são
// N+1 chamadas à RPC de saldos + o histórico, e qualquer uma que lance derrubava
// o shell inteiro (header e sidebar) na tela de erro global do Next. Aqui o erro
// degrada só o painel e o operador continua na aplicação.
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
      <p className="font-medium">Não foi possível carregar os itens</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro ao buscar os saldos e o histórico. Tente novamente.
      </p>
      <Button onClick={reset} variant="outline">
        Tentar novamente
      </Button>
    </div>
  )
}
