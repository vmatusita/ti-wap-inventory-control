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
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type NavItem = {
  rotulo: string
  icone: LucideIcon
  href?: string // sem href = placeholder (fase futura)
  match?: string // prefixo p/ marcar "ativo" (default: href)
  // F21 — item que só o NÍVEL administrador vê (admin ou dev, via `eAdmin`). A trava real é
  // o `admin/layout.tsx` (redireciona quem não é) + as actions e o RLS; aqui é só não oferecer.
  soAdmin?: boolean
  // F22 — item que só o cargo dev vê. Flag PRÓPRIA, e não `soAdmin`, porque as duas
  // perguntas são diferentes: `eAdmin` é NÍVEL (admin ⊂ dev) e responde "true" para o dev,
  // então marcar /dev como `soAdmin` a mostraria para todo administrador.
  soDev?: boolean
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
  // F25 — este href é o PADRÃO/fallback: o layout do grupo manda `hrefRelatorios`
  // resolvido POR CARGO (o operador cai na aba da filial dele) e ele substitui este
  // valor no render. Esquecer a prop degrada para o comportamento antigo, nunca para
  // um item sem link. O realce independe do href (usa `match`).
  { rotulo: 'Relatórios', icone: BarChart3, href: '/relatorios/geral', match: '/relatorios' },
  {
    rotulo: 'Administração',
    icone: Settings,
    href: '/admin/usuarios',
    match: '/admin',
    soAdmin: true,
  },
  // F22 — a área técnica do 4º cargo. Fica DEPOIS de Administração e ANTES de Ajuda: é o
  // item mais raro do menu e não pode empurrar o "?" para o meio da lista.
  {
    rotulo: 'Desenvolvedor',
    icone: Wrench,
    href: '/dev',
    match: '/dev',
    soDev: true,
  },
  { rotulo: 'Ajuda', icone: CircleHelp, href: '/ajuda' },
]

function ativa(pathname: string, item: NavItem): boolean {
  const alvo = item.match ?? item.href ?? ''
  if (alvo === '/') return pathname === '/'
  return pathname === alvo || pathname.startsWith(`${alvo}/`) || pathname === item.href
}

// Navegacao lateral. F21: os itens de OPERAÇÃO são os mesmos para todos os cargos
// (todo logado LÊ tudo — ADR-001/ADR-002); só "Administração" é do nível admin.
// F22: "Desenvolvedor" é do cargo dev, e por isso são DUAS flags, não uma.
// `eAdmin`/`eDev` vêm do `(app)/layout.tsx`, que resolve o cargo uma vez.
// `pendencias` (OS-F9 / T2): contagem vinda do layout do operador (server-side, a
// cada navegacao — sem realtime). Zero ou ausente = sem badge.
export function SidebarNav({
  className,
  onNavigate,
  pendencias,
  eAdmin = false,
  eDev = false,
  hrefRelatorios,
}: {
  className?: string
  onNavigate?: () => void
  pendencias?: number
  /** F25 — destino de "Relatórios" resolvido por cargo no servidor. */
  hrefRelatorios?: string
  eAdmin?: boolean
  // Default `false` de propósito: enquanto o `(app)/layout.tsx` não passar a prop, o item
  // /dev simplesmente não aparece — a rota continua protegida pelo `dev/layout.tsx`, então
  // o pior caso de esquecer a prop é um menu incompleto, nunca um vazamento.
  eDev?: boolean
}) {
  const pathname = usePathname()
  // As duas flags são independentes: `eAdmin` é NÍVEL (o dev também o atende) e `eDev` é o
  // cargo exato. Um item marcado com as duas exigiria as duas.
  const itens = ITENS.filter((i) => (eAdmin || !i.soAdmin) && (eDev || !i.soDev))

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
        const href =
          item.match === '/relatorios' && hrefRelatorios ? hrefRelatorios : item.href
        const contagem =
          item.href === '/pendencias' && pendencias && pendencias > 0 ? pendencias : null
        return (
          <Link
            key={item.rotulo}
            href={href}
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
