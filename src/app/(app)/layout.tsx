import { redirect } from 'next/navigation'
import { getPerfilAtual } from '@/lib/queries/profile'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarNav } from '@/components/layout/sidebar-nav'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const perfil = await getPerfilAtual()
  if (!perfil) redirect('/login')

  const isAdmin = perfil.role === 'admin'
  const nome = perfil.nome?.trim() || 'Usuário'

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader nome={nome} role={perfil.role} isAdmin={isAdmin} />
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r bg-background p-3 md:block">
          <SidebarNav isAdmin={isAdmin} />
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
