import Link from 'next/link'
import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'

// Ajuda contextual (OS-F11 §1.5 / T3, reapontada na F20). Server Component, sem
// estado. Um "?" discreto ao lado do titulo da tela, linkando a PAGINA da
// documentacao que descreve aquela tela. Alvo >= 40px (mobile) e nome acessivel
// sempre presente.
//
// `pagina` e um SLUG do registry (`src/lib/ajuda/registry.ts`) — ate a F19 era o
// id de uma secao da ajuda de pagina unica. O mapa tela -> pagina esta em
// docs/PLANO-AJUDA.md §3, e o describe "LinkAjuda nas telas" de
// `src/lib/ajuda/registry.test.ts` trava que todo alvo usado no app existe no
// registry: link de ajuda quebrado nao chega a producao.
//
// O componente NAO importa o registry de proposito: ele e montado em telas do
// operador que nada tem a ver com a documentacao, e o registry e so-servidor
// (arrasta as constantes reais e o PapaParse). A validacao mora no teste.
type LinkAjudaProps = {
  pagina: string
  ancora?: string
  rotulo?: string
  className?: string
}

export function LinkAjuda({ pagina, ancora, rotulo, className }: LinkAjudaProps) {
  return (
    <Link
      href={`/ajuda/${pagina}${ancora ? `#${ancora}` : ''}`}
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
