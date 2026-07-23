import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'

// Ajuda contextual (OS-F11 §1.5, item T3). Server Component, sem estado.
// Um "?" discreto ao lado do titulo da tela, linkando a secao correspondente
// de /ajuda. Alvo >= 40px (mobile) e nome acessivel sempre presente.
//
// ANCORAS VALIDAS — sao os ids reais das secoes de `src/lib/ajuda/conteudo.ts`
// (conferidos na fase 0 da F11, 22/07/2026). Nao existe outra:
//   conceito · status · movimentacoes · termos · itens · pendencias ·
//   relatorios · como-fazer · admin · acesso
//
// Mapa tela -> ancora fixado pela OS:
//   /movimentacoes e /movimentacoes/nova -> movimentacoes
//   /pendencias -> pendencias · /relatorios/[filial] -> relatorios
//   /itens -> itens · /ativos -> status · /ativos/novo -> como-fazer
//   /admin/importar -> admin (o import e nota dentro de Administracao)
type LinkAjudaProps = {
  ancora: string
  rotulo?: string
  className?: string
}

export function LinkAjuda({ ancora, rotulo, className }: LinkAjudaProps) {
  return (
    <Link
      href={`/ajuda#${ancora}`}
      aria-label={rotulo ?? 'Ajuda sobre esta tela'}
      title={rotulo ?? 'Ajuda sobre esta tela'}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground',
        'transition-colors hover:bg-muted hover:text-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <CircleHelp className="size-4" aria-hidden />
    </Link>
  )
}
