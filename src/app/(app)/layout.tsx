import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOperador, getViewerSession, temSessaoSupabase } from '@/lib/auth/acesso'
import { redirectAcessoRelatorios } from '@/lib/auth/otp'
import { contarPendenciasAbertas } from '@/lib/queries/pendencias-detalhe'
import { contarConflitosAbertos } from '@/lib/queries/conflitos'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarLateral } from '@/components/layout/sidebar-lateral'
import { SidebarColapsoProvider } from '@/components/layout/sidebar-colapso'
import { SCRIPT_SIDEBAR } from '@/components/layout/sidebar-preferencia'
import { rotaRelatorioPadrao } from '@/lib/relatorios/rota-padrao'
import { resolverFiliaisSlugs } from '@/lib/filtros/filial'
import { listarFiliais } from '@/lib/queries/filiais'
import { ViewerHeader } from '@/components/layout/viewer-header'
import {
  BarraProgressoNavegacao,
  ProgressoNavegacaoProvider,
} from '@/components/layout/progresso-navegacao'
import { AtalhosGlobais } from '@/components/movimentacoes/atalho-global'
import { PaletaComandosProvider } from '@/components/layout/paleta-comandos'
import { INDICE_PALETA } from '@/lib/ajuda/indice'
import { TooltipProvider } from '@/components/ui/tooltip'
import { eAdmin, eDev, podeEscrever } from '@/lib/auth/papeis'
import { versaoAtual } from '@/lib/versoes/registry'

// F35 — a versao no ar desce por PROP para o shell (pe da sidebar, no desktop e
// no Sheet do celular). Constante de modulo, e nao chamada por request: o
// registry e imutavel entre deploys, mesma disciplina do `INDICE_PALETA`. E
// tambem o que impede o Client Component de importar o registry inteiro.
const VERSAO_ATUAL = versaoAtual().versao

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
  // FLX-01 — search da rota atual (o proxy grava, ver lib/supabase/proxy.ts):
  // usado para reconstruir `next` no redirect de sessão de visualizador
  // ausente/expirada, mais abaixo.
  const search = h.get('x-wap-search') ?? ''

  if (pathname === '/relatorios/acesso') {
    const operador = await getOperador()
    // F25 — o operador logado que abre a porta da SENHA é devolvido ao relatório
    // dele, não ao Consolidado: é o mesmo destino do item da sidebar.
    if (operador) redirect(await rotaRelatorioPadrao(operador))
    return <>{children}</>
  }

  const operador = await getOperador()
  if (operador) {
    // Badge de pendências (OS-F9 / T2): contagem só DEPOIS de confirmar o
    // operador — a v_pendencias é negada pela RLS na sessão de visualizador por
    // senha, e antecipar a chamada derrubaria o shell dos relatórios. Sem
    // realtime: atualiza a cada navegação.
    // F24 — o badge soma a fila E os conflitos entre filiais. Os conflitos NÃO estão em
    // `v_fila_pendencias` (têm fonte e mesa próprias), então sem esta soma o selo diria
    // "nenhuma pendência" com trabalho esperando na aba de conflitos. Um GRUPO conta como
    // UMA pendência — é uma decisão a tomar, não duas. As duas contagens engolem o próprio
    // erro e devolvem 0: falha de leitura não pode derrubar o shell.
    // F25 — o selo conta com o MESMO recorte com que /pendencias abre para este
    // cargo (o padrão, sem URL). Um selo global sobre uma lista recortada faria o
    // operador ver "20" e encontrar 5, sem nada explicando a diferença.
    //
    // ⚠ O `catch` NÃO é decorativo: `listarFiliais()` LANÇA quando a leitura falha, e
    // este é o layout de TODAS as rotas do app — sem a guarda, um blip no banco
    // derrubaria o shell inteiro por causa de um SELO. É a mesma disciplina que as
    // duas contagens abaixo já seguiam ("falha de leitura não pode derrubar o
    // shell"); degradar para o selo GLOBAL é o pior caso aceitável, e é o
    // comportamento de antes desta fase.
    // F29/UXG-12 — a MESMA leitura serve a duas coisas agora: recortar o selo e dar
    // NOME às filiais de escrita no menu do usuário. Uma chamada só (`listarFiliais`
    // é memoizada por request de qualquer forma), e o `catch` continua degradando
    // para o pior caso aceitável: selo global e menu sem a linha de filiais.
    const filiaisDoShell = await listarFiliais().catch((e) => {
      console.error('[layout] falha ao ler as filiais do shell', e)
      return [] as Awaited<ReturnType<typeof listarFiliais>>
    })
    const filiaisDoSelo =
      filiaisDoShell.length > 0
        ? resolverFiliaisSlugs(undefined, operador, filiaisDoShell)
        : []
    const [pendenciasFila, conflitos] = await Promise.all([
      contarPendenciasAbertas(filiaisDoSelo),
      contarConflitosAbertos(filiaisDoSelo),
    ])
    const pendencias = pendenciasFila + conflitos
    // F21 — o CARGO é resolvido UMA vez, aqui, e desce por prop para o shell
    // inteiro (header, sidebar, paleta, atalhos). Nada de cada peça consultar o
    // banco outra vez: `getOperador()` já traz papel + filiais de escrita.
    // Os dois booleanos são o que a UI de fato pergunta — o vínculo por filial
    // só interessa às TELAS, que resolvem o operador por conta própria.
    const escreve = podeEscrever(operador.papel)
    const admin = eAdmin(operador.papel)
  // F22 — o cargo dev NAO cabe no booleano `eAdmin`: ele e um nivel ACIMA, e o unico que
  // enxerga a area /dev. Resolvido aqui, junto dos outros, para nenhuma peca consultar o
  // banco de novo (o mesmo motivo do comentario acima).
  const dev = eDev(operador.papel)
    // F25 — o destino de "Relatórios" também é resolvido UMA vez aqui e desce por
    // prop para a sidebar e a paleta (que a espelha): o operador vai para a aba da
    // filial dele, os demais para o Consolidado.
    const hrefRelatorios = await rotaRelatorioPadrao(operador)
    // Só o OPERADOR vê "Escreve em: …": admin e dev escrevem em todas (a linha seria
    // ruído) e consulta não escreve em nenhuma (o rótulo do cargo já diz isso).
    const filiaisEscritaNomes =
      operador.papel === 'operador'
        ? operador.filiaisEscrita
            .map((id) => filiaisDoShell.find((f) => f.id === id)?.nome)
            .filter((n): n is string => Boolean(n))
        : undefined
    return (
      <TooltipProvider delayDuration={300}>
        {/* UXG-13 — o anti-flash da sidebar recolhida, na mesma disciplina do
            tema: um script que roda ANTES da primeira pintura e marca o <html>,
            de onde o CSS tira a largura. Sem ele, quem recolheu veria 240px
            pintados e o salto para 64px na hidratação. O `<html>` já tem
            `suppressHydrationWarning` (F19) — foi o next-themes que o exigiu, e
            é ele que absorve este atributo também.
            Fica no ramo do OPERADOR porque só aqui existe sidebar: o
            visualizador por senha não tem menu lateral nenhum. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_SIDEBAR }} />
        <SidebarColapsoProvider>
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
            eDev={dev}
            hrefRelatorios={hrefRelatorios}
          >
            <div className="flex min-h-svh flex-col">
              <AppHeader
                nome={operador.nome}
                papel={operador.papel}
                email={operador.email}
                filiaisEscrita={filiaisEscritaNomes}
                pendencias={pendencias}
                podeEscrever={escreve}
                eAdmin={admin}
                eDev={dev}
                hrefRelatorios={hrefRelatorios}
                versao={VERSAO_ATUAL}
              />
              <div className="flex flex-1">
                <SidebarLateral
                  pendencias={pendencias}
                  eAdmin={admin}
                  eDev={dev}
                  hrefRelatorios={hrefRelatorios}
                  versao={VERSAO_ATUAL}
                />
                <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
              </div>
            </div>
          </PaletaComandosProvider>
        </ProgressoNavegacaoProvider>
        </SidebarColapsoProvider>
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
    // FLX-01 — guarda o destino atual: sem isto o ViewerAutoRefresh (60s), que
    // dispara este redirect NO MEIO da leitura de um relatório, mandava o
    // gestor sempre para /relatorios/geral, perdendo filial, período e filtros.
    redirect(redirectAcessoRelatorios(pathname, search))
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
