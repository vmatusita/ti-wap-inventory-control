'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TentarNovamente } from '@/components/layout/tentar-novamente'

// UXG-01/F27 — boundary de erro da RAIZ, irmão de `not-found.tsx` (mesmo par
// que aquele arquivo já documenta): cobre `/login`, `/auth/confirm`,
// `/auth/definir-senha` e `/relatorios/acesso` — rotas fora do grupo (app) que
// não tinham NENHUM `error.tsx` próprio. Sem isto, qualquer exceção nessas
// telas pulava direto para `global-error.tsx` (que substitui o root layout
// inteiro — perde o ThemeProvider, é bem mais brusco) em vez de só trocar o
// conteúdo, como as telas de dentro de (app) já fazem.
//
// Ao contrário do `global-error.tsx`, aqui o root layout TERMINOU de renderizar
// com sucesso (senão o erro teria acontecido mais acima, no próprio
// global-error) — o contexto do App Router está garantido, então reusar
// `TentarNovamente` (que chama `useRouter`) é seguro.
//
// Sem shell: fora de (app) não há sessão resolvida, logo não há header/sidebar
// para montar (mesmo motivo do `not-found.tsx` irmão). Os dois destinos abaixo
// cobrem operador E visualizador por senha — este boundary não sabe qual dos
// dois é.
export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  reset: () => void
  // Opcional pelo mesmo motivo dos boundaries irmãos: a API ainda é `unstable_`
  // e, se um minor do Next a renomear, ela chega `undefined` aqui — o fallback
  // do `TentarNovamente` cobre.
  unstable_retry?: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <p className="font-medium">Algo deu errado</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        A operação não foi concluída. Tente de novo; se continuar, avise o
        administrador do sistema.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <TentarNovamente aoTentar={unstable_retry} reset={reset} rotulo="Tentar de novo" />
        <Button asChild variant="outline">
          <Link href="/relatorios/geral">Ir para o relatório</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Ir para o início</Link>
        </Button>
      </div>
    </div>
  )
}
