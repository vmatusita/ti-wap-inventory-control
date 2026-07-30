import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOperador, getViewerSession, temSessaoSupabase } from '@/lib/auth/acesso'
import { contarPendenciasAbertas } from '@/lib/queries/pendencias-detalhe'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { ViewerHeader } from '@/components/layout/viewer-header'
import {
  BarraProgressoNavegacao,
  ProgressoNavegacaoProvider,
} from '@/components/layout/progresso-navegacao'
import { AtalhosGlobais } from '@/components/movimentacoes/atalho-global'
import { PaletaComandosProvider } from '@/components/layout/paleta-comandos'
import { INDICE_PALETA } from '@/lib/ajuda/indice'
import { TooltipProvider } from '@/components/ui/tooltip'
import { eAdmin, podeEscrever } from '@/lib/auth/papeis'

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
    // F21 — o CARGO é resolvido UMA vez, aqui, e desce por prop para o shell
    // inteiro (header, sidebar, paleta, atalhos). Nada de cada peça consultar o
    // banco outra vez: `getOperador()` já traz papel + filiais de escrita.
    // Os dois booleanos são o que a UI de fato pergunta — o vínculo por filial
    // só interessa às TELAS, que resolvem o operador por conta própria.
    const escreve = podeEscrever(operador.papel)
    const admin = eAdmin(operador.papel)
    return (
      <TooltipProvider delayDuration={300}>
        <ProgressoNavegacaoProvider>
          <BarraProgressoNavegacao />
          {/* Atalhos `N` e `?` + paleta Ctrl+K / "/" — SÓ neste ramo (operador).
              O ramo do visualizador por senha, mais abaixo, não monta nenhum dos
              dois: ele só enxerga /relatorios/** e não tem para onde navegar.
              `N` leva a uma tela de ESCRITA: quem não escreve fica só com o `?`. */}
          <AtalhosGlobais novaMovimentacao={escreve} />
          {/* F20: o índice da documentação é montado NO SERVIDOR e desce por
              prop. O registry é só-servidor (arrasta as constantes reais e o
              PapaParse); a paleta é Client Component e nunca pode importá-lo.
              Constante de módulo, e não chamada de função: este layout é o shell
              de TODAS as rotas do app e recomputá-lo a cada request seria
              normalizar as 33 páginas em toda tela. */}
          <PaletaComandosProvider
            paginasAjuda={INDICE_PALETA}
            podeEscrever={escreve}
            eAdmin={admin}
          >
            <div className="flex min-h-svh flex-col">
              <AppHeader
                nome={operador.nome}
                papel={operador.papel}
                pendencias={pendencias}
                podeEscrever={escreve}
                eAdmin={admin}
              />
              <div className="flex flex-1">
                <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 self-start overflow-y-auto border-r bg-background p-3 md:block print:hidden">
                  <SidebarNav pendencias={pendencias} eAdmin={admin} />
                </aside>
                <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
              </div>
            </div>
          </PaletaComandosProvider>
        </ProgressoNavegacaoProvider>
      </TooltipProvider>
    )
  }

  // Sem operador: o proxy só deixa chegar aqui em /relatorios/** com cookie de
  // visualização. Confere assinatura + senha ativa (consulta ao banco).
  const viewer = await getViewerSession()

  // F21 — separar os dois "sem operador", mas SÓ depois de descartar o visualizador.
  //
  // `getOperador()` devolve null tanto para "não há sessão" quanto para "sessão VÁLIDA, mas
  // perfil DESATIVADO" — o segundo caso não existia antes desta fase. Mandar o desligado para
  // a porta pública da senha de relatório não explica nada; ele vai para o login com o motivo.
  //
  // A ORDEM importa e a primeira versão desta correção errou: o teste vinha antes do
  // `getViewerSession()`, e o cookie de visualização tem `path: '/relatorios'` — ou seja, é
  // entregue exatamente nas rotas que o ramo barrava. Quem foi desligado como operador MAS é
  // visualizador legítimo por senha entrava em `/relatorios/acesso`, acertava a senha, recebia
  // o cookie, era redirecionado para `/relatorios/geral` e caía no login: senha certa na mão e
  // nenhum relatório na tela. Com o teste aqui, o cookie válido ganha — a senha de acesso é
  // uma porta INDEPENDENTE do cargo (spec §3), e perder o login de operador não pode revogar
  // um acesso que nunca dependeu dele.
  if (!viewer) {
    if (await temSessaoSupabase()) redirect('/login?erro=acesso-desativado')
    redirect('/relatorios/acesso')
  }

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
