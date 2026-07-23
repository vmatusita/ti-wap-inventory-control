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
    <section id={id} className="scroll-mt-28 break-before-page space-y-3">
      <div className="flex w-full items-center gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {/* O controle mais tocado do relatório no celular tinha 28px. `size-10`
            (40px) é o alvo mínimo; como o botão é `md:hidden`, o desktop não
            muda em nada (F13/B4-R4). */}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={conteudoId}
          className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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
