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
  pendencias,
  podeEscrever = false,
  eAdmin = false,
}: {
  nome: string
  papel?: PapelUsuario
  pendencias?: number
  podeEscrever?: boolean
  eAdmin?: boolean
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
            />
          </div>
        </SheetContent>
      </Sheet>

      <Marca />

      <div className="ml-auto flex items-center gap-3">
        {/* Descoberta da paleta para quem não vive de atalho: lupa sempre, o
            "Ctrl K" só no desktop (no mobile não há teclado para a dica). */}
        {abrirPaleta && (
          <Button
            type="button"
            variant="ghost"
            onClick={abrirPaleta}
            aria-label="Buscar ativos e comandos (Ctrl K)"
            className="size-10 justify-center px-0 text-white hover:bg-white/10 hover:text-white sm:h-7 sm:w-auto sm:gap-1.5 sm:px-2"
          >
            <Search className="size-5 sm:size-4" />
            <kbd
              aria-hidden
              className="hidden rounded border border-white/25 bg-white/10 px-1 text-[10px] font-semibold sm:inline"
            >
              Ctrl K
            </kbd>
          </Button>
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
        <UserMenu nome={nome} papel={papel} />
      </div>
    </header>
  )
}
