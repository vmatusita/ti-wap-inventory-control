'use client'

import { useEffect } from 'react'
import { Geist } from 'next/font/google'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import './globals.css'

// UXG-01/F27 — boundary de ÚLTIMA INSTÂNCIA: só dispara quando o ROOT layout em
// si falha, ou quando `src/app/error.tsx` (login/auth/relatorios-acesso) também
// lança. Antes deste arquivo não existia NENHUM boundary fora do grupo (app) —
// a exceção caía na tela crua do Next, em inglês (backlog da F13; a F20B só
// criou o `(app)/error.tsx`).
//
// Por convenção do Next (doc oficial, file-conventions/error §global-error),
// `global-error.tsx` SUBSTITUI o root layout INTEIRO — por isso declara
// <html>/<body> próprios. Duas consequências:
//
// 1) Reimporta `./globals.css` e a fonte Geist de propósito: sem isto, nada de
//    Tailwind/tokens chegaria aqui (o import de CSS do `layout.tsx` não ajuda —
//    este arquivo não passa por ele). É o MESMO padrão que a doc oficial usa em
//    `global-not-found.tsx` (reimportar CSS/fonte num arquivo que também troca
//    o documento inteiro).
// 2) NÃO reusa `PainelErro`/`TentarNovamente` (ver o comentário de
//    `tentar-novamente.tsx`): aquele fallback chama `useRouter()`, que exige o
//    contexto do App Router — contexto que ESTE boundary, por definição, pode
//    não ter montado. O botão abaixo usa só `reset()`, a única prop que o Next
//    garante nesta posição. `Button` é seguro de importar direto (só `cva` +
//    classe, sem contexto nenhum) — diferente do `TentarNovamente`.
//
// Sem o `ThemeProvider` (next-themes) daqui pra baixo, a página sempre renderiza
// no tema CLARO — mas é exatamente o default do app (`defaultTheme="light"` em
// `theme-provider.tsx`), então não é regressão visual: só não acompanha uma
// preferência escura já salva. Decisão registrada em docs/DECISOES.md.
//
// Nada de stack, mensagem crua ou digest na UI (mesmo padrão dos boundaries
// irmãos) — o objeto vai só para o console do navegador.
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export default function GlobalError({
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
    <html lang="pt-BR" className={`${geistSans.variable} antialiased`}>
      <body className="min-h-svh bg-background text-foreground">
        <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="size-8 text-destructive" />
          <p className="font-medium">Algo deu errado</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            A aplicação não conseguiu carregar esta página. Tente de novo; se
            continuar, avise o administrador do sistema.
          </p>
          <Button onClick={() => reset()} variant="outline" className="mt-1">
            Tentar de novo
          </Button>
        </div>
      </body>
    </html>
  )
}
