'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, Plus } from 'lucide-react'
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

// `pendencias` (OS-F9 / T2): contagem do layout do operador, repassada ao
// SidebarNav de dentro do Sheet mobile — o mesmo badge do desktop.
export function AppHeader({
  nome,
  pendencias,
}: {
  nome: string
  pendencias?: number
}) {
  const [aberto, setAberto] = useState(false)

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
            <SidebarNav onNavigate={() => setAberto(false)} pendencias={pendencias} />
          </div>
        </SheetContent>
      </Sheet>

      <Marca />

      <div className="ml-auto flex items-center gap-3">
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
        <UserMenu nome={nome} />
      </div>
    </header>
  )
}
