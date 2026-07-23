'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  Package,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
  // F11/M8: a sidebar leva à LISTA (o histórico que nunca existiu); registrar
  // continua a um clique — pelo botão do header, pelo atalho `N` e pelo card do
  // dashboard, todos direto em /movimentacoes/nova.
  { rotulo: 'Movimentações', icone: ArrowLeftRight, href: '/movimentacoes' },
  { rotulo: 'Itens', icone: Boxes, href: '/itens' },
  { rotulo: 'Pendências', icone: ClipboardList, href: '/pendencias' },
  { rotulo: 'Relatórios', icone: BarChart3, href: '/relatorios/geral', match: '/relatorios' },
  { rotulo: 'Administração', icone: Settings, href: '/admin/usuarios', match: '/admin' },
  { rotulo: 'Ajuda', icone: CircleHelp, href: '/ajuda' },
]

function ativa(pathname: string, item: NavItem): boolean {
  const alvo = item.match ?? item.href ?? ''
  if (alvo === '/') return pathname === '/'
  return pathname === alvo || pathname.startsWith(`${alvo}/`) || pathname === item.href
}

// Navegacao lateral. Nivel unico: todo operador ve os mesmos itens.
// `pendencias` (OS-F9 / T2): contagem vinda do layout do operador (server-side, a
// cada navegacao — sem realtime). Zero ou ausente = sem badge.
export function SidebarNav({
  className,
  onNavigate,
  pendencias,
}: {
  className?: string
  onNavigate?: () => void
  pendencias?: number
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
        const contagem =
          item.href === '/pendencias' && pendencias && pendencias > 0 ? pendencias : null
        return (
          <Link
            key={item.rotulo}
            href={item.href}
            onClick={onNavigate}
            aria-current={atual ? 'page' : undefined}
            aria-label={
              contagem
                ? `${item.rotulo} — ${contagem} ${contagem === 1 ? 'aberta' : 'abertas'}`
                : undefined
            }
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              atual
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icone className="size-4 shrink-0" aria-hidden />
            {item.rotulo}
            {contagem ? (
              <Badge variant="warning" aria-hidden className="ml-auto tabular-nums">
                {contagem.toLocaleString('pt-BR')}
              </Badge>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
