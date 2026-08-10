'use client'

import { Fragment } from 'react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type NavItem = {
  rotulo: string
  icone: LucideIcon
  href?: string // sem href = placeholder (fase futura)
  match?: string // prefixo p/ marcar "ativo" (default: href)
  // UXG-13a (F30) — abre um GRUPO: um filete acima do item. Sem título de
  // seção, que só somaria ruído a nove itens. A regra de "não nascer órfão"
  // (divisor no primeiro item da lista já filtrada) é do render, não daqui:
  // quem some por cargo muda de operador para operador.
  separadorAntes?: boolean
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
    // UXG-13a — daqui para baixo não é mais operação do dia a dia: são os
    // cadastros e a área técnica. O filete separa o que se usa toda hora do que
    // se usa de vez em quando.
    separadorAntes: true,
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
  // UXG-13a — a Ajuda não pertence a nenhum dos dois grupos acima: é o rodapé
  // do menu. Para o cargo Consulta (que não vê Administração nem Desenvolvedor)
  // este é o ÚNICO filete da sidebar — e mesmo assim não fica órfão, porque tem
  // itens acima e um item abaixo dele.
  { rotulo: 'Ajuda', icone: CircleHelp, href: '/ajuda', separadorAntes: true },
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
  id,
  colapsada = false,
  onNavigate,
  pendencias,
  eAdmin = false,
  eDev = false,
  hrefRelatorios,
}: {
  className?: string
  /** UXG-13 — alvo do `aria-controls` do botão de recolher (só no desktop). */
  id?: string
  // UXG-13 — modo só-ícones. É só COMPORTAMENTO (tooltip no lugar do rótulo):
  // o visual do colapso é CSS, pendurado no `data-sidebar` do <html>, para não
  // haver salto entre a pintura do servidor e a hidratação. O Sheet do celular
  // nunca passa `colapsada` — o menu de toque não muda.
  colapsada?: boolean
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
    <nav id={id} className={cn('flex flex-col gap-1', className)}>
      {itens.map((item, indice) => {
        // UXG-13a — o filete NUNCA no primeiro item da lista já filtrada: para
        // um operador sem "Administração" nem "Desenvolvedor", "Ajuda" poderia
        // ser o primeiro e o divisor ficaria pendurado no topo, sem separar nada.
        const separador = Boolean(item.separadorAntes) && indice > 0

        if (!item.href) {
          return (
            <span
              key={item.rotulo}
              aria-disabled="true"
              title="Disponível nas próximas fases"
              data-sidebar-item=""
              className={cn(
                'flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/70',
                separador && 'mt-1 border-t pt-3',
              )}
            >
              <item.icone className="size-4 shrink-0" aria-hidden />
              {/* F19 — 10px era pequeno demais para um rótulo de texto; 11px é o
                  mínimo usado no resto do app (pílulas das tabelas). Ramo hoje
                  inalcançável: todos os itens de ITENS têm `href`. */}
              <span data-sidebar-rotulo="" className="flex min-w-0 flex-1 items-center gap-3">
                {item.rotulo}
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                  em breve
                </span>
              </span>
            </span>
          )
        }

        const atual = ativa(pathname, item)
        const href =
          item.match === '/relatorios' && hrefRelatorios ? hrefRelatorios : item.href
        const contagem =
          item.href === '/pendencias' && pendencias && pendencias > 0 ? pendencias : null
        const descricao = contagem
          ? `${item.rotulo} — ${contagem} ${contagem === 1 ? 'aberta' : 'abertas'}`
          : item.rotulo
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={atual ? 'page' : undefined}
            // Recolhida, o rótulo visível some — e o nome acessível passa a ser
            // a ÚNICA identificação do item. Por isso ele deixa de ser
            // condicional à contagem e vale sempre.
            aria-label={descricao}
            data-sidebar-item=""
            // O gancho que o CSS do modo ícone precisa para EMPILHAR este item
            // (ícone em cima, contagem embaixo). Só o item que tem selo muda de
            // eixo; os outros continuam a linha de sempre. Vem do servidor junto
            // com a contagem, então não há salto entre pintura e hidratação —
            // mesma disciplina do resto do bloco `data-sidebar` no globals.css.
            data-sidebar-com-selo={contagem ? '' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              separador && 'mt-1 border-t pt-3',
              atual
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icone className="size-4 shrink-0" aria-hidden />
            <span data-sidebar-rotulo="">{item.rotulo}</span>
            {contagem ? (
              <Badge
                variant="warning"
                aria-hidden
                data-sidebar-selo=""
                className="ml-auto tabular-nums"
              >
                {contagem.toLocaleString('pt-BR')}
              </Badge>
            ) : null}
          </Link>
        )

        if (!colapsada) return <Fragment key={item.rotulo}>{link}</Fragment>

        // Só-ícones: o nome do item precisa continuar alcançável pelo mouse E
        // pelo teclado (o Tooltip do Radix abre no foco, não só no hover). O
        // `TooltipProvider` já vem do `(app)/layout.tsx`.
        return (
          <Tooltip key={item.rotulo}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{descricao}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}
