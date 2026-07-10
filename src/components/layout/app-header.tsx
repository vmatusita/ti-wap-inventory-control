'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
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

function Marca() {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded bg-[#eda100] px-2 py-1 text-xs font-bold tracking-tight text-black">
        WAP
      </span>
      <span className="text-sm font-semibold">Estoque TI</span>
    </div>
  )
}

export function AppHeader({ nome }: { nome: string }) {
  const [aberto, setAberto] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-[#111110] px-4 text-white">
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menu"
            className="text-white hover:bg-white/10 hover:text-white md:hidden"
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
          <div className="p-3">
            <SidebarNav />
          </div>
        </SheetContent>
      </Sheet>

      <Marca />

      <div className="ml-auto">
        <UserMenu nome={nome} />
      </div>
    </header>
  )
}
