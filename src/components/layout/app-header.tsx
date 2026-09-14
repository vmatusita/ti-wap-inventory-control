'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { RodapeSidebar } from '@/components/layout/rodape-sidebar'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { UserMenu } from '@/components/layout/user-menu'
import { Marca } from '@/components/layout/marca'
import { useAbrirPaleta } from '@/components/layout/paleta-comandos'
import type { PapelUsuario } from '@/lib/auth/papeis'

// `pendencias` (OS-F9 / T2): contagem do layout do operador, repassada ao
// SidebarNav de dentro do Sheet mobile — o mesmo badge do desktop.
//
// F21 — `papel`/`podeEscrever`/`eAdmin` vêm resolvidos do `(app)/layout.tsx`:
// o CTA "Nova movimentação" (a única escrita do header) só existe para quem
// escreve, e o menu lateral do mobile esconde "Administração" para não-admin
// exatamente como o do desktop.
export function AppHeader({
  nome,
  papel,
  email,
  nomesDoEscopoEscrita,
  pendencias,
  podeEscrever = false,
  eAdmin = false,
  eDev = false,
  hrefRelatorios,
  versao,
}: {
  nome: string
  papel?: PapelUsuario
  /** F29/UXG-12 — e-mail e filiais de escrita descem do shell para o menu do usuário. */
  email?: string | null
  nomesDoEscopoEscrita?: readonly string[]
  pendencias?: number
  podeEscrever?: boolean
  eAdmin?: boolean
  /** F22 — cargo Desenvolvedor: o item /dev do menu so aparece para ele. */
  eDev?: boolean
  /** F25 — destino de "Relatórios" por cargo. O menu MOBILE monta a MESMA
   *  SidebarNav do desktop; sem repassar aqui, o operador no celular continuaria
   *  indo para o Consolidado enquanto no desktop ia para a filial dele. */
  hrefRelatorios?: string
  /** F35 — a versão no ar, mostrada no pé do menu (aqui, o Sheet do celular). */
  versao: string
}) {
  const [aberto, setAberto] = useState(false)
  // Gatilho da paleta global (OS-F11 / T1). `null` fora do provider — nesse caso
  // a lupa nem aparece, em vez de virar um botão morto.
  const abrirPaleta = useAbrirPaleta()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-brand-dark px-4 text-white md:px-6 print:hidden">
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menu"
            className="size-10 text-white hover:bg-white/10 hover:text-white md:size-8 md:hidden"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 text-foreground">
          <SheetHeader className="border-b">
            <SheetTitle>
              <Marca />
            </SheetTitle>
          </SheetHeader>
          <div className="px-3 pt-1 pb-3">
            <SidebarNav
              onNavigate={() => setAberto(false)}
              pendencias={pendencias}
              eAdmin={eAdmin}
              eDev={eDev}
              hrefRelatorios={hrefRelatorios}
            />
            {/* F35 — o MESMO rodapé do <aside> do desktop. Nunca `colapsada`:
                o menu de toque não recolhe (o CSS do recolhido é ancorado no
                <aside>, que não existe aqui). O `onNavigate` é o mesmo da
                `SidebarNav` acima: sem ele, tocar no badge navegava para
                `/versoes` e deixava a gaveta aberta por cima da tela. */}
            <div className="mt-2 border-t pt-2">
              <RodapeSidebar versao={versao} onNavigate={() => setAberto(false)} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* F29/UXG-10e — a marca vira link para o início. É a convenção universal
          (logo → home) e o `Marca` continua burro: quem envolve é o header, porque só
          ele sabe o destino de cada shell (o do visualizador aponta para o relatório
          consolidado, em `viewer-header.tsx`). */}
      <Link
        href="/"
        aria-label="Ir para o início"
        className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-amarelo"
      >
        <Marca />
      </Link>

      <div className="ml-auto flex items-center gap-3">
        {/* F29/UXG-10a — a única porta VISÍVEL da busca global era um botão-fantasma
            de 28px, e o centro do header ficava vazio no desktop. Agora é um
            campo-placebo: parece um campo de busca (o gesto que todo mundo conhece),
            mas é um <button> — clicar abre a paleta, que é onde a busca de verdade
            acontece. Não é um <input> de propósito: um campo real aqui teria de
            duplicar a busca inteira e roubaria o foco do campo da paleta ao abri-la.
            No celular continua a lupa: 320px não comportam o campo, e lá não há
            teclado para a dica do atalho. */}
        {abrirPaleta && (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={abrirPaleta}
              aria-label="Buscar ativos e comandos (Ctrl K)"
              className="size-10 justify-center px-0 text-white hover:bg-white/10 hover:text-white sm:hidden"
            >
              <Search className="size-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={abrirPaleta}
              aria-label="Buscar ativos e comandos (Ctrl K)"
              className="hidden h-8 w-64 justify-start gap-2 border border-white/20 bg-white/5 px-2.5 font-normal text-white/70 hover:bg-white/10 hover:text-white sm:flex md:w-72"
            >
              <Search className="size-4 shrink-0" aria-hidden />
              {/* `min-w-0 flex-1 truncate`: o `Button` é `whitespace-nowrap` e não
                  recorta nada, então sem isto o conteúdo (16 + 8 + ~170 + 8 + ~43
                  ≈ 245px) estourava os ~234px úteis de um `w-64` e o `kbd` saía
                  POR CIMA da borda direita, encostando no CTA ao lado. Quem cede
                  espaço é o texto (que tem reticências e é `aria-hidden` — o nome
                  acessível está no `aria-label` do botão), nunca o selo do
                  atalho. O `md:w-72` devolve a frase inteira onde ela cabe. */}
              <span aria-hidden className="min-w-0 flex-1 truncate text-left">
                Buscar ativo, tela ou ação…
              </span>
              <kbd
                aria-hidden
                className="shrink-0 rounded border border-white/25 bg-white/10 px-1 text-[10px] font-semibold text-white"
              >
                Ctrl K
              </kbd>
            </Button>
          </>
        )}
        {podeEscrever && (
          <Button
            asChild
            size="sm"
            className="h-10 bg-brand-amarelo text-black hover:bg-brand-amarelo/90 sm:h-7"
          >
            <Link href="/movimentacoes/nova">
              <Plus className="size-4" />
              <span className="hidden sm:inline">Nova movimentação</span>
              <span
                aria-hidden
                className="ml-1 hidden rounded border border-black/20 bg-black/10 px-1 text-[10px] font-semibold sm:inline"
              >
                N
              </span>
            </Link>
          </Button>
        )}
        <UserMenu
          nome={nome}
          papel={papel}
          email={email}
          nomesDoEscopoEscrita={nomesDoEscopoEscrita}
        />
      </div>
    </header>
  )
}
