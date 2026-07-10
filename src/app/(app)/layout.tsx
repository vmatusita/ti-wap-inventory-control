import { redirect } from 'next/navigation'
import { getPerfilAtual } from '@/lib/queries/profile'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { AtalhoGlobalNovaMovimentacao } from '@/components/movimentacoes/atalho-global'
import { TooltipProvider } from '@/components/ui/tooltip'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const perfil = await getPerfilAtual()
  if (!perfil) redirect('/login')

  const nome = perfil.nome?.trim() || 'Usuário'

  return (
    <TooltipProvider delayDuration={300}>
      <AtalhoGlobalNovaMovimentacao />
      <div className="flex min-h-svh flex-col">
        <AppHeader nome={nome} />
        <div className="flex flex-1">
          <aside className="hidden w-60 shrink-0 border-r bg-background p-3 md:block">
            <SidebarNav />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  )
}
