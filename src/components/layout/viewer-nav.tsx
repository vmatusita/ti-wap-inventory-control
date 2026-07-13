'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, FileClock } from 'lucide-react'
import { cn } from '@/lib/utils'

// Navegação do shell REDUZIDO da sessão por senha (gestor). Sem sidebar, então
// os dois destinos de relatório ficam no header: "Ao vivo" (por filial) e
// "Gerados" (o arquivo semanal — snapshots congelados). É o caminho do gestor
// para conferir os relatórios gerados.
const ITENS = [
  {
    rotulo: 'Ao vivo',
    href: '/relatorios/geral',
    icone: BarChart3,
    ativo: (p: string) =>
      p.startsWith('/relatorios/') && !p.startsWith('/relatorios/gerados'),
  },
  {
    rotulo: 'Gerados',
    href: '/relatorios/gerados',
    icone: FileClock,
    ativo: (p: string) => p.startsWith('/relatorios/gerados'),
  },
]

export function ViewerNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1">
      {ITENS.map((item) => {
        const on = item.ativo(pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3',
              on
                ? 'bg-white/15 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white',
            )}
          >
            <item.icone className="size-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{item.rotulo}</span>
          </Link>
        )
      })}
    </nav>
  )
}
