import { sessaoDaPorta } from '@/lib/relatorios/porta-sessao'
import { ViewerHeader } from '@/components/layout/viewer-header'
import {
  BarraProgressoNavegacao,
  ProgressoNavegacaoProvider,
} from '@/components/layout/progresso-navegacao'
import { TooltipProvider } from '@/components/ui/tooltip'

// O SHELL DA PORTA PÚBLICA (F68 · decisão 11): o cabeçalho do visualizador (a marca, o nome da empresa, o rótulo da senha,
// "Relatórios gerados", "Ao vivo" e Sair) e nada do shell do operador — sem sidebar, sem paleta, sem atalhos.
//
// A sessão é conferida PELO BANCO a cada request (`sessaoDaPorta` → `relatorio_publico_dados`, pedido `sessao`): sem
// cookie ou sessão recusada → a entrada da MESMA empresa; a diagonal (o slug da rota não é o da sessão) → 404. Nenhum
// client administrativo, nenhum client de sessão: só `src/lib/supabase/publico.ts` (a fronteira:
// `queries/relatorios/fronteira-viewer.test.ts`).
//
// ⚠ Sem `loading.tsx` nesta árvore, de propósito: com ele a rota seria servida em stream, e o `redirect()`/`notFound()`
// daqui sairia DENTRO do payload com HTTP 200 — o 404 da diagonal e o redirect para a entrada precisam ser status.
export default async function LayoutDaSessaoDaPorta({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ empresa: string }>
}) {
  const { empresa } = await params
  const sessao = await sessaoDaPorta(empresa)
  return (
    <TooltipProvider delayDuration={300}>
      <ProgressoNavegacaoProvider>
        <BarraProgressoNavegacao />
        <div className="flex min-h-svh flex-col">
          <ViewerHeader rotulo={sessao.rotulo} slug={sessao.empresa.slug} empresaNome={sessao.empresa.nome} />
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </ProgressoNavegacaoProvider>
    </TooltipProvider>
  )
}
