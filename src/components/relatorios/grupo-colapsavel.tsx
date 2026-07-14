'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Seção de grupo recolhível no MOBILE (§3.7): grupos fechados por padrão em
// <768px, exceto o primeiro. No desktop (md+) sempre expandido (md:block); na
// impressão sempre expandido (.grupo-conteudo em @media print). SSR-safe: o
// estado inicial vem só da prop `sempreAberto` (determinístico), sem matchMedia.
// O toggle (com aria-expanded) é só-mobile (md:hidden → não-focável no desktop),
// então o estado ARIA nunca contradiz o conteúdo exibido no desktop.
export function GrupoColapsavel({
  id,
  titulo,
  descricao,
  sempreAberto = false,
  children,
}: {
  id: string
  titulo: string
  descricao?: string
  sempreAberto?: boolean
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(sempreAberto)
  const conteudoId = `${id}-conteudo`

  return (
    <section id={id} className="scroll-mt-16 break-before-page space-y-3">
      <div className="flex w-full items-center gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={conteudoId}
          className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label={aberto ? `Recolher ${titulo}` : `Expandir ${titulo}`}
        >
          <ChevronDown className={cn('size-5 transition-transform', aberto && 'rotate-180')} />
        </button>
      </div>

      <div id={conteudoId} className={cn('grupo-conteudo space-y-3.5', !aberto && 'hidden', 'md:block')}>
        {children}
      </div>
    </section>
  )
}
