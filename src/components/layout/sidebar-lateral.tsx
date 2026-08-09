'use client'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { useSidebarColapso } from '@/components/layout/sidebar-colapso'

/** O id que o botão de recolher aponta em `aria-controls`. */
export const ID_SIDEBAR_NAV = 'sidebar-nav'

// UXG-13 (F30) — o <aside> saiu do `(app)/layout.tsx` (Server Component) e virou
// este Client Component, porque agora ele depende de uma preferência do
// navegador. O MOBILE não passa por aqui: o Sheet do hambúrguer monta a mesma
// `SidebarNav` sem `colapsada`, e continua exatamente como estava.
//
// DIVISÃO DE TRABALHO, e ela é o ponto todo deste desenho:
//
//   • O VISUAL do estado recolhido (largura, rótulos, selo) é CSS, pendurado no
//     atributo `data-sidebar` do <html> — escrito pelo script inline ANTES da
//     primeira pintura e mantido pelo `alternar()`. Mecanismo único: não há como
//     React e CSS discordarem, e quem recarrega já recolhido não vê salto.
//   • O COMPORTAMENTO (tooltip no modo ícone, `aria-expanded`, o ícone que
//     comunica a direção) é React, a partir do estado do contexto.
//
// Por isso as classes aqui descrevem só o estado EXPANDIDO: recolher é sempre o
// CSS por cima (`globals.css`, bloco `:root[data-sidebar='recolhida']`).
export function SidebarLateral({
  pendencias,
  eAdmin,
  eDev,
  hrefRelatorios,
}: {
  pendencias?: number
  eAdmin?: boolean
  eDev?: boolean
  hrefRelatorios?: string
}) {
  const { recolhida, alternar } = useSidebarColapso()

  return (
    <aside
      data-sidebar-lateral=""
      // A transição não roda na carga (o elemento já NASCE com 4rem quando a
      // preferência é recolhida) — só quando o operador clica ou aperta `[`.
      className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 self-start overflow-x-hidden overflow-y-auto border-r bg-background p-3 transition-[width] duration-150 md:block print:hidden"
    >
      <div className="flex h-full flex-col justify-between gap-2">
        <SidebarNav
          id={ID_SIDEBAR_NAV}
          colapsada={recolhida}
          pendencias={pendencias}
          eAdmin={eAdmin}
          eDev={eDev}
          hrefRelatorios={hrefRelatorios}
        />
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!recolhida}
          aria-controls={ID_SIDEBAR_NAV}
          aria-keyshortcuts="["
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          title={recolhida ? 'Expandir menu ([)' : 'Recolher menu ([)'}
          data-sidebar-item=""
          className="flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {recolhida ? (
            <PanelLeftOpen className="size-4 shrink-0" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" aria-hidden />
          )}
          {/* O mesmo gancho dos rótulos do menu — o CSS o esconde no modo ícone. */}
          <span data-sidebar-rotulo="">Recolher</span>
        </button>
      </div>
    </aside>
  )
}
