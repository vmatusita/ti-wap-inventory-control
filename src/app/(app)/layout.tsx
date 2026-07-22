import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOperador, getViewerSession } from '@/lib/auth/acesso'
import { contarPendenciasAbertas } from '@/lib/queries/pendencias-detalhe'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { ViewerHeader } from '@/components/layout/viewer-header'
import {
  BarraProgressoNavegacao,
  ProgressoNavegacaoProvider,
} from '@/components/layout/progresso-navegacao'
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
    // Badge de pendências (OS-F9 / T2): contagem só DEPOIS de confirmar o
    // operador — a v_pendencias é negada pela RLS na sessão de visualizador por
    // senha, e antecipar a chamada derrubaria o shell dos relatórios. Sem
    // realtime: atualiza a cada navegação.
    const pendencias = await contarPendenciasAbertas()
    return (
      <TooltipProvider delayDuration={300}>
        <ProgressoNavegacaoProvider>
          <BarraProgressoNavegacao />
          <AtalhoGlobalNovaMovimentacao />
          <div className="flex min-h-svh flex-col">
            <AppHeader nome={operador.nome} pendencias={pendencias} />
            <div className="flex flex-1">
              <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 self-start overflow-y-auto border-r bg-background p-3 md:block print:hidden">
                <SidebarNav pendencias={pendencias} />
              </aside>
              <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
            </div>
          </div>
        </ProgressoNavegacaoProvider>
      </TooltipProvider>
    )
  }

  // Sem operador: o proxy só deixa chegar aqui em /relatorios/** com cookie de
  // visualização. Confere assinatura + senha ativa (consulta ao banco).
  const viewer = await getViewerSession()
  if (!viewer) redirect('/relatorios/acesso')

  return (
    <TooltipProvider delayDuration={300}>
      <ProgressoNavegacaoProvider>
        <BarraProgressoNavegacao />
        <div className="flex min-h-svh flex-col">
          <ViewerHeader rotulo={viewer.rotulo} />
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </ProgressoNavegacaoProvider>
    </TooltipProvider>
  )
}
