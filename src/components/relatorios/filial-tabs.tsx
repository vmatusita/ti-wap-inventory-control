'use client'

import Link, { useLinkStatus } from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import { NavRolavel } from '@/components/layout/nav-rolavel'

// Indicador de navegação de uma tab (F6B/B1). useLinkStatus (Next 16) só
// funciona DENTRO de um <Link>, então este subcomponente vive como filho do
// Link e expõe o `pending` daquela tab: acende a barra global e mostra um
// spinner discreto na tab clicada enquanto o destino carrega.
function IndicadorTab() {
  const { pending } = useLinkStatus()
  useReportarNavegacao(pending)
  if (!pending) return null
  // F19 — spinner parado quando o sistema pede menos movimento. É o único sem
  // texto ao lado, mas a navegação pendente continua anunciada pela barra de
  // progresso do topo e pelo estado do próprio link.
  return <Loader2 className="ml-1.5 size-3 animate-spin motion-reduce:animate-none" aria-hidden />
}

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
    <NavRolavel
      className="-mx-4 -mb-px md:mx-0 print:hidden"
      navClassName="flex gap-1 overflow-x-auto border-b px-4 [scrollbar-width:none] md:px-0 [&::-webkit-scrollbar]:hidden"
      rotulo="Filiais do relatório"
    >
      {tabs.map((t) => {
        const ativa = t.slug === atual
        return (
          <Link
            key={t.slug}
            href={`/relatorios/${t.slug}${sufixo}`}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              ativa
                ? 'border-brand-amarelo font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.nome}
            <IndicadorTab />
          </Link>
        )
      })}
    </NavRolavel>
  )
}
