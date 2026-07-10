import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  Package,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = { rotulo: string; icone: LucideIcon }

const ITENS: NavItem[] = [
  { rotulo: 'Dashboard', icone: LayoutDashboard },
  { rotulo: 'Ativos', icone: Package },
  { rotulo: 'Movimentações', icone: ArrowLeftRight },
  { rotulo: 'Relatórios', icone: BarChart3 },
  { rotulo: 'Administração', icone: Settings },
]

// Navegacao lateral. Na F0 os itens sao placeholders desabilitados; as telas
// chegam nas fases seguintes. Nivel unico: todo operador ve os mesmos itens.
export function SidebarNav({ className }: { className?: string }) {
  return (
    <nav className={cn('flex flex-col gap-1', className)}>
      {ITENS.map((item) => (
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
      ))}
    </nav>
  )
}
