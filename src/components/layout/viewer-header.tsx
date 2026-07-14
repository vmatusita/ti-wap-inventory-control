import { Eye, LogOut } from 'lucide-react'
import { sairVisualizacao } from '@/lib/actions/senhas'
import { Button } from '@/components/ui/button'
import { ViewerNav } from '@/components/layout/viewer-nav'
import { Marca } from '@/components/layout/marca'

// Header do shell REDUZIDO da sessão por senha (OS-F3 3.9.4): marca + navegação
// (ao vivo / gerados) + rótulo da senha + "Sair". Sem sidebar, sem links de
// operação (ativos/movimentações/admin) — a navegação de relatório fica aqui.
export function ViewerHeader({ rotulo }: { rotulo: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-brand-dark px-4 text-white md:px-6 print:hidden">
      <Marca label="Estoque TI · Relatórios" labelClassName="hidden sm:inline" />

      <ViewerNav />

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 sm:flex">
          <Eye className="size-3.5" />
          Visualização · {rotulo}
        </span>
        <form action={sairVisualizacao}>
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="gap-1.5 text-white hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" />
            Sair
          </Button>
        </form>
      </div>
    </header>
  )
}
