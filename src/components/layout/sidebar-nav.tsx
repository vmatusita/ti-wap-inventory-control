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
  // F21 — item que só o cargo Admin vê. A trava real é o `admin/layout.tsx`
  // (redireciona não-admin) + as actions e o RLS; aqui é só não oferecer.
  soAdmin?: boolean
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
  {
    rotulo: 'Administração',
    icone: Settings,
    href: '/admin/usuarios',
    match: '/admin',
    soAdmin: true,
  },
  { rotulo: 'Ajuda', icone: CircleHelp, href: '/ajuda' },
]

function ativa(pathname: string, item: NavItem): boolean {
  const alvo = item.match ?? item.href ?? ''
  if (alvo === '/') return pathname === '/'
  return pathname === alvo || pathname.startsWith(`${alvo}/`) || pathname === item.href
}

// Navegacao lateral. F21: os itens de OPERAÇÃO são os mesmos para os três cargos
// (todo logado LÊ tudo — ADR-001/ADR-002); só "Administração" é exclusiva do
// Admin. `eAdmin` vem do `(app)/layout.tsx`, que resolve o cargo uma vez.
// `pendencias` (OS-F9 / T2): contagem vinda do layout do operador (server-side, a
// cada navegacao — sem realtime). Zero ou ausente = sem badge.
export function SidebarNav({
  className,
  onNavigate,
  pendencias,
  eAdmin = false,
}: {
  className?: string
  onNavigate?: () => void
  pendencias?: number
  eAdmin?: boolean
}) {
  const pathname = usePathname()
  const itens = eAdmin ? ITENS : ITENS.filter((i) => !i.soAdmin)

  return (
    <nav className={cn('flex flex-col gap-1', className)}>
      {itens.map((item) => {
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
              {/* F19 — 10px era pequeno demais para um rótulo de texto; 11px é o
                  mínimo usado no resto do app (pílulas das tabelas). Ramo hoje
                  inalcançável: todos os itens de ITENS têm `href`. */}
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
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
