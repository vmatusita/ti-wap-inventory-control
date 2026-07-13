'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  Package,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  rotulo: string
  icone: LucideIcon
  href?: string // sem href = placeholder (fase futura)
  match?: string // prefixo p/ marcar "ativo" (default: href)
}

const ITENS: NavItem[] = [
  { rotulo: 'Dashboard', icone: LayoutDashboard, href: '/' },
  { rotulo: 'Ativos', icone: Package, href: '/ativos' },
  { rotulo: 'Movimentações', icone: ArrowLeftRight, href: '/movimentacoes/nova' },
  { rotulo: 'Relatórios', icone: BarChart3, href: '/relatorios/geral', match: '/relatorios' },
  { rotulo: 'Administração', icone: Settings, href: '/admin/usuarios', match: '/admin' },
]

function ativa(pathname: string, item: NavItem): boolean {
  const alvo = item.match ?? item.href ?? ''
  if (alvo === '/') return pathname === '/'
  return pathname === alvo || pathname.startsWith(`${alvo}/`) || pathname === item.href
}

// Navegacao lateral. Nivel unico: todo operador ve os mesmos itens.
export function SidebarNav({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className={cn('flex flex-col gap-1', className)}>
      {ITENS.map((item) => {
        if (!item.href) {
          return (
            <span
              key={item.rotulo}
              aria-disabled="true"
              title="Disponível nas próximas fases"
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/70"
            >
              <item.icone className="size-4 shrink-0" aria-hidden />
              {item.rotulo}
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                em breve
              </span>
            </span>
          )
        }

        const atual = ativa(pathname, item)
        return (
          <Link
            key={item.rotulo}
            href={item.href}
            onClick={onNavigate}
            aria-current={atual ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              atual
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icone className="size-4 shrink-0" aria-hidden />
            {item.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
