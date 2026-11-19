'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TentarNovamente } from '@/components/layout/tentar-novamente'
import { caminhoDaPorta, slugValido } from '@/lib/auth/porta-rotas'

// O BOUNDARY DE ERRO DA PORTA PÚBLICA (F68) — o irmão de `not-found.tsx` aqui ao lado, pelo mesmo motivo: sem ele, uma
// falha do banco na porta (`relatorio_publico_dados` fora do ar, a resposta fora da forma) caía no `app/error.tsx` da raiz,
// cujos links são do operador. Acima do layout da sessão (o erro do PRÓPRIO layout também cai aqui), sem shell. Nada de
// mensagem crua, stack ou digest na tela; o objeto vai para o console do navegador, como nos boundaries irmãos.
export default function ErroNaPorta({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  // Opcional pelo mesmo motivo dos boundaries irmãos: a API ainda é `unstable_` (Next ≥ 16.2).
  unstable_retry?: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])
  const { empresa } = useParams<{ empresa: string }>()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="font-medium">Não foi possível abrir o relatório agora</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Tente de novo em instantes; se continuar, avise quem lhe passou a senha de acesso.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <TentarNovamente aoTentar={unstable_retry} reset={reset} rotulo="Tentar de novo" />
        {slugValido(empresa) ? (
          <Button asChild variant="outline">
            <Link href={caminhoDaPorta(empresa, 'gerados')}>Relatórios gerados</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
