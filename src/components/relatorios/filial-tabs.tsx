'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

// Tabs de filial (mockup): filiais ativas + "Consolidado" (slug 'geral'). Tab
// ativa com o sublinhado amarelo WAP. Preserva o período nos searchParams.
export function FilialTabs({
  filiais,
  atual,
}: {
  filiais: { slug: string; nome: string }[]
  atual: string
}) {
  const params = useSearchParams()
  const qs = params.toString()
  const sufixo = qs ? `?${qs}` : ''
  const tabs = [...filiais, { slug: 'geral', nome: 'Consolidado' }]

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b print:hidden">
      {tabs.map((t) => {
        const ativa = t.slug === atual
        return (
          <Link
            key={t.slug}
            href={`/relatorios/${t.slug}${sufixo}`}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
              ativa
                ? 'border-[#eda100] font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.nome}
          </Link>
        )
      })}
    </nav>
  )
}
