'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, FileClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { caminhoDaPorta } from '@/lib/auth/porta-rotas'
import { ABA_RELATORIO_CONSOLIDADO } from '@/lib/auth/papeis'

// Navegação do cabeçalho da PORTA PÚBLICA (o gestor que entra por senha). Sem sidebar: os dois destinos de relatório
// ficam aqui — "Ao vivo" e "Gerados" (o arquivo semanal).
//
// F68 (19/11/2026): os destinos são os da porta DA EMPRESA (`/r/<slug>/relatorios/…`), montados SÓ por `caminhoDaPorta`
// (lib/auth/porta-rotas.ts, função pura testada) — nenhum `href` literal aqui, e nenhum sai da porta da mesma empresa
// (o confinamento: `components/relatorios/confinamento-viewer.test.ts`). O "Ao vivo" leva ao consolidado, que mostra o
// aviso até a F68B (o ao vivo pela porta); a memória da última filial vista (RV-17) volta com ele.
export function ViewerNav({ slug }: { slug: string }) {
  const pathname = usePathname()
  const gerados = caminhoDaPorta(slug, 'gerados')
  const itens = [
    {
      rotulo: 'Ao vivo',
      href: caminhoDaPorta(slug, ABA_RELATORIO_CONSOLIDADO),
      icone: BarChart3,
      ativo: (p: string) => p.startsWith(`${caminhoDaPorta(slug)}/`) && !p.startsWith(gerados),
    },
    {
      rotulo: 'Gerados',
      href: gerados,
      icone: FileClock,
      ativo: (p: string) => p.startsWith(gerados),
    },
  ]

  return (
    <nav className="flex items-center gap-1">
      {itens.map((item) => {
        const on = item.ativo(pathname)
        return (
          <Link
            key={item.rotulo}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-amarelo focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark',
              on
                ? 'bg-brand-dark-texto/15 text-brand-dark-texto'
                : 'text-brand-dark-texto/70 hover:bg-brand-dark-texto/10 hover:text-brand-dark-texto',
            )}
          >
            <item.icone className="size-4 shrink-0" aria-hidden />
            <span>{item.rotulo}</span>
          </Link>
        )
      })}
    </nav>
  )
}
