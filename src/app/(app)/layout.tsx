import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOperador, getViewerSession } from '@/lib/auth/acesso'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { ViewerHeader } from '@/components/layout/viewer-header'
import { AtalhoGlobalNovaMovimentacao } from '@/components/movimentacoes/atalho-global'
import { TooltipProvider } from '@/components/ui/tooltip'

// Shell do grupo (app). Três modos (spec §3 / OS-F3 3.9.4):
//  - Público: /relatorios/acesso (entrada por senha) — sem shell.
//  - Operador logado: header + sidebar completos.
//  - Visualizador por senha: shell REDUZIDO (só relatórios), sem sidebar de
//    operação. A validade da sessão por senha é conferida aqui a cada request
//    (getViewerSession consulta o banco) — revogar mata no request seguinte.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const h = await headers()
  const pathname = h.get('x-wap-pathname') ?? ''

  if (pathname === '/relatorios/acesso') {
    const operador = await getOperador()
    if (operador) redirect('/relatorios/geral')
    return <>{children}</>
  }

  const operador = await getOperador()
  if (operador) {
    return (
      <TooltipProvider delayDuration={300}>
        <AtalhoGlobalNovaMovimentacao />
        <div className="flex min-h-svh flex-col">
          <AppHeader nome={operador.nome} />
          <div className="flex flex-1">
            <aside className="hidden w-60 shrink-0 border-r bg-background p-3 md:block print:hidden">
              <SidebarNav />
            </aside>
            <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // Sem operador: o proxy só deixa chegar aqui em /relatorios/** com cookie de
  // visualização. Confere assinatura + senha ativa (consulta ao banco).
  const viewer = await getViewerSession()
  if (!viewer) redirect('/relatorios/acesso')

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-svh flex-col">
        <ViewerHeader rotulo={viewer.rotulo} />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </TooltipProvider>
  )
}
