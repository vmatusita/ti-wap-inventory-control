#!/usr/bin/env -S npx tsx
// A PRÉVIA ESTÁTICA DA F61 — fotografar os COMPONENTES REAIS de `admin/` e
// `relatorios/` sem banco, no MESMO MOLDE de `previa-itens.tsx` (F43) e
// `previa-ficha.tsx` (F44). Leia o cabeçalho de `previa-itens.tsx` para o "por
// quê" completo (a ausência de `.env.ensaio`, o `.env.local` apontando para o
// ensaio, a proibição de `scripts/design/capturar.mjs` nesta fase) — aqui só o
// que muda.
//
// ============================================================================
// O QUE ESTA FERRAMENTA PROVA
// ============================================================================
// A F61 converte 45 arquivos de `src/components/admin/` e
// `src/components/relatorios/` para a régua de layout, cria os pontos de
// injeção da identidade (sigla/nome/crédito) e faz meia dúzia de correções
// pequenas (verde de sucesso, confirmações digitadas, diálogos semeados,
// filtros de URL, chaves de storage) — TUDO sem mudar um pixel fora da tabela
// de mudanças de propósito (`docs/f61-evidencias/mudancas-de-proposito.json`).
// Este instrumento roda DUAS VEZES sobre o MESMO catálogo fictício — uma vez
// sobre o código de hoje ("antes"), outra sobre o código no fim da fase
// ("depois") — e o par de fotos + HTML normalizado é o que prova a promessa.
//
// ============================================================================
// O QUE É REAL, E O QUE É DUBLÊ — leia antes de confiar numa foto
// ============================================================================
// REAL (importado de `src/`, exatamente o que vai ao ar): todo componente
// listado na tabela de vitrines do relatório desta fase — as tabelas e
// diálogos de `components/admin/**`, os cartões/tabelas/listas de
// `components/relatorios/**`, `ConfirmacaoDigitada`, `Marca`, `CreditoAutor`,
// `AppHeader`, `ViewerHeader`, `RodapeSidebar`, `SidebarLateral`, as páginas
// `login`, `auth/confirm` e `not-found` inteiras, e o kit `components/ui/`.
// DUBLÊ (declarados aqui, e só aqui):
//   · o pacote `server-only` (`vazio-servidor.ts`, herdado da F43/F44);
//   · `@/components/ui/dialog` (`duble-dialog.tsx`, NOVO NESTA FASE) — o Portal
//     do Radix só monta em `useLayoutEffect`, que `renderToStaticMarkup` nunca
//     roda. Ligado só quando este script roda com
//     `--tsconfig scripts/design/tsconfig.previa-f61.json` (a vitrine
//     `admin-dialogos` e qualquer outra que arraste um diálogo por baixo).
// NÃO EXISTE na foto: a fonte Geist (`next/font` só roda dentro do Next) — cai
//   no fallback `system-ui` do próprio `globals.css` (não há `@font-face`
//   nenhum lá, então não há rede nenhuma para esperar).
// EXCEÇÃO ÚNICA E DECLARADA — TRECHO COPIADO, não componente: o rodapé de
//   `src/app/(app)/versoes/page.tsx` (a página é `async` e chama
//   `getOperador()`, que exige sessão). Só o `<p>` final — que só depende de
//   `versaoAtual()`, uma função PURA do registry — é reproduzido aqui,
//   marcado "TRECHO COPIADO", com `CreditoAutor` e `versaoAtual()` reais.
//
// ============================================================================
// SEM VITRINE — declarado aqui, não descoberto por quem for procurar depois
// ============================================================================
//   · `auth/definir-senha/page.tsx` — Server Component que chama
//     `createClient().auth.getUser()` e consulta `profiles`: exige sessão e
//     banco de verdade. Sem eles a página só sabe fazer `redirect('/login')`.
//   · `devolucao-fornecedor-form.tsx` (painel de sucesso) — o estado
//     `sucesso` nasce `null` e só existe depois de um POST bem-sucedido; não
//     há prop para semeá-lo de fora.
//   · `admin/importar/importar-wizard.tsx` — máquina de estados de várias
//     etapas (upload de arquivo, `FormData`, Server Actions, reanálise) sem
//     estado inicial que valha a pena além do que `TabelaErros`,
//     `CorrecoesAplicadas` e `GruposErros` já fotografam soltos.
//   · 9 dos 10 `correcao.kind` de `GrupoErro` (`categoria`, `estado`,
//     `site_desconhecido`, `site_outra_filial`, `existe_em_outra_filial`,
//     `patrimonio`, `patrimonio_vazio`, `duplicata`, `data`, `colaborador` —
//     só `nenhuma` entra). Cada um decide o que oferecer cruzando
//     `contexto`/`vocabulario` pelo motor de `lib/import/*`; reproduzir os
//     nove exigiria replicar aquele motor só para a foto. O quadro
//     `grupos-erros` desta prévia mostra o card informativo (`'nenhuma'`),
//     que é o único independente disso.
//   · `CorpoRelatorio`/`CorpoRelatorioV2` inteiros — exigem montar um
//     `SnapshotRelatorio` completo (dezenas de campos, os 3 grupos do e-mail).
//     As peças que a régua mais reprova (KPIs, cartões, tabelas, listas,
//     legendas, medidor) já saem cobertas, uma a uma, na vitrine `relatorio`.
//
// ============================================================================
// USO
// ============================================================================
//   npx tsx --tsconfig scripts/design/tsconfig.previa-f61.json \
//     scripts/design/previa-f61.tsx --saida <pasta>
//
//   --vitrines         lista separada por vírgula (padrão: todas —
//                       cromo,admin-tabelas,admin-importar,admin-dialogos,
//                       relatorio,confirmacoes,selos-sucesso,filtros)
//   --saida            pasta de destino (obrigatório na prática)
//   --larguras         padrão `1440x900,390x844`
//   --temas            padrão `claro,escuro`
//   --so-html          não fotografa; só grava o HTML (e o normalizado)
//   --sabotar-css      acrescenta o texto ao FIM do CSS compilado (para a
//                      sabotagem K de `comparar-pixels-f61.mjs`)
//   --capturar-quadros `sim` (padrão) ou `nao` — desliga a leitura de bbox e a
//                      gravação de `medidas.json` (só photos + HTML)
//
// A pasta de saída é sempre limpa dos arquivos que esta passada regrava.

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  PathParamsContext,
  PathnameContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime'

import { TooltipProvider } from '@/components/ui/tooltip'
import { Table, TableBody, TableRow } from '@/components/ui/table'
import { Marca } from '@/components/layout/marca'
import { CreditoAutor } from '@/components/layout/credito-autor'
import { RodapeSidebar } from '@/components/layout/rodape-sidebar'
import { SidebarLateral } from '@/components/layout/sidebar-lateral'
import { AppHeader } from '@/components/layout/app-header'
import { ViewerHeader } from '@/components/layout/viewer-header'
import { ProgressoNavegacaoProvider } from '@/components/layout/progresso-navegacao'
import { ConfirmacaoDigitada } from '@/components/layout/confirmacao-digitada'
import { StatusBadge } from '@/components/ativos/status-badge'
import { PainelSucesso } from '@/components/movimentacoes/nova/painel-sucesso'
import { AcessoForm } from '@/components/relatorios/acesso-form'
import NaoEncontrado from '@/app/not-found'
import ConfirmarPage from '@/app/auth/confirm/page'
import LoginPage from '@/app/login/page'
import { versaoAtual } from '@/lib/versoes/registry'

// ---- admin ------------------------------------------------------------
import { TiposItemTabela } from '@/components/admin/tipos-item-tabela'
import { ItensTabela } from '@/components/admin/itens-tabela'
import { ColaboradoresTabela } from '@/components/admin/colaboradores-tabela'
import { UsuariosTabela } from '@/components/admin/usuarios/usuarios-tabela'
import { AuditoriaTabela } from '@/components/admin/usuarios/auditoria-tabela'
import { AuditoriaFiltro } from '@/components/admin/usuarios/auditoria-filtro'
import { FilaConsolidacao } from '@/components/admin/fila-consolidacao'
import { FilialDialog } from '@/components/admin/filial-dialog'
import { KitDialog } from '@/components/admin/kit-dialog'
import { MotivoDialog } from '@/components/admin/motivo-dialog'
import { ItemDialog } from '@/components/admin/item-dialog'
import { TipoItemDialog } from '@/components/admin/tipo-item-dialog'
import { ColaboradorDialog } from '@/components/admin/colaborador-dialog'
import { EditarUsuarioDialog } from '@/components/admin/usuarios/editar-usuario-dialog'
import { ConvidarUsuarioDialog } from '@/components/admin/convidar-usuario-dialog'
import { CriarSenhaDialog } from '@/components/admin/criar-senha-dialog'
import { TestarSenhaDialog } from '@/components/admin/testar-senha-dialog'
import { GerarLinkAcesso } from '@/components/admin/usuarios/gerar-link-acesso'
import { EncerrarSessoesDialog } from '@/components/admin/usuarios/encerrar-sessoes-dialog'
import { ApagarUsuarioDialog } from '@/components/admin/usuarios/apagar-usuario-dialog'
import { TabelaErros } from '@/components/admin/importar/tabela-erros'
import { CorrecoesAplicadas } from '@/components/admin/importar/correcoes-aplicadas'
import { GruposErros } from '@/components/admin/importar/grupos-erros'

// ---- relatórios ---------------------------------------------------------
import { GerarRelatorioDialog } from '@/components/relatorios/gerar-relatorio-dialog'
import { KpiTiles, GrupoKpis } from '@/components/relatorios/kpi-tiles'
import { CardRelatorio } from '@/components/relatorios/card-relatorio'
import {
  CabecalhoDetalhe,
  CelulaChamado,
  CelulaData,
  CelulaObs,
  CelulaPatrimonio,
  BadgeEstornada,
  PilulaTipo,
} from '@/components/relatorios/celulas'
import { FiltrosTabela } from '@/components/relatorios/filtros-tabela'
import type { CampoFiltro, Opcao } from '@/components/relatorios/use-filtros-tabela'
import { GrupoColapsavel } from '@/components/relatorios/grupo-colapsavel'
import {
  GlossarioRelatorio,
  LegendaDelta,
  LegendaEstorno,
  LegendaManutencao,
  LegendaTroca,
} from '@/components/relatorios/legendas'
import { ListaManutencao } from '@/components/relatorios/lista-manutencao'
import { ListaModelo } from '@/components/relatorios/lista-modelo'
import { ListaModeloCategoria } from '@/components/relatorios/lista-modelo-categoria'
import { ListaReservados } from '@/components/relatorios/lista-reservados'
import { ManutencaoCasos } from '@/components/relatorios/manutencao-casos'
import { MedidorMinimo } from '@/components/relatorios/medidor-minimo'
import { ObservacaoCard } from '@/components/relatorios/observacao-card'
import { ResumoPeriodoCard } from '@/components/relatorios/resumo-periodo'
import { TabelaSaidas } from '@/components/relatorios/tabela-saidas'
import { TabelaEntradas } from '@/components/relatorios/tabela-entradas'
import { TabelaTransferencias } from '@/components/relatorios/tabela-transferencias'
import { TabelaMovimentacoes } from '@/components/relatorios/tabela-movimentacoes'
import { TabelaMovItens } from '@/components/relatorios/tabela-mov-itens'
import { TabelaItensGrupo } from '@/components/relatorios/tabela-itens-grupo'

// ---- filtros de URL -------------------------------------------------------
import { ItensFiltros } from '@/components/itens/itens-filtros'
import { HistoricoFiltros } from '@/components/itens/historico-filtros'
import { AtivosFiltros } from '@/components/ativos/ativos-filtros'
import { PendenciasFiltros } from '@/components/pendencias/pendencias-filtros'
import { ListaFiltros } from '@/components/movimentacoes/lista-filtros'

import {
  FILIAIS_PREVIA,
  FILIAL_CERRADO_ALTO,
  FULANO,
  EMAIL_FULANO,
  ITENS_CATALOGO_PREVIA,
  TIPOS_ITEM_ADMIN_PREVIA,
  ITENS_ADMIN_PREVIA,
  TIPOS_ITEM_ATIVOS_PREVIA,
  COLABORADORES_ADMIN_PREVIA,
  USUARIOS_ADMIN_PREVIA,
  FILIAIS_PARA_VINCULO_PREVIA,
  EU_ID_PREVIA,
  EVENTOS_ADMIN_PREVIA,
  FILA_CONSOLIDACAO_PREVIA,
  RESUMO_CONSOLIDACAO_PREVIA,
  FILIAL_EDIT_PREVIA,
  MOTIVOS_PREVIA,
  MOTIVO_EDIT_PREVIA,
  KIT_EDIT_PREVIA,
  ITEM_EDIT_PREVIA,
  TIPO_ITEM_EDIT_PREVIA,
  COLABORADOR_EDIT_PREVIA,
  EDITAR_USUARIO_PROPS_PREVIA,
  CONVIDAR_USUARIO_PROPS_PREVIA,
  GERAR_RELATORIO_PROPS_PREVIA,
  ERROS_BLOQUEANTES_PREVIA,
  ERROS_AVISO_PREVIA,
  CORRECOES_APLICADAS_PREVIA,
  CORRECOES_POR_OP_PREVIA,
  GRUPOS_ERROS_PREVIA,
  CONTEXTO_IMPORT_PREVIA,
  TIPOS_AVISO_IMPORT_PREVIA,
  VOCABULARIO_CLIENTE_PREVIA,
  KPIS_PREVIA,
  KPIS_ANTERIOR_PREVIA,
  PERIODO_PREVIA,
  LINHAS_SAIDA_PREVIA,
  LINHAS_ENTRADA_PREVIA,
  MAPA_ROTULOS_TIPO_ITEM_PREVIA,
  LINHAS_TRANSFERENCIA_PREVIA,
  MOVIMENTACOES_RELATORIO_PREVIA,
  LANCAMENTOS_ITEM_PREVIA,
  SALDOS_ITEM_PERIODO_PREVIA,
  MANUTENCAO_CASOS_PREVIA,
  ITENS_MANUTENCAO_PREVIA,
  ITENS_MODELO_PREVIA,
  MODELOS_POR_CATEGORIA_PREVIA,
  ITENS_RESERVADOS_PREVIA,
  RESUMO_PERIODO_PREVIA,
  SUCESSO_LOTE_PREVIA,
} from './previa-f61-dados'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ---------------------------------------------------------------------------
// 1 · Argumentos
// ---------------------------------------------------------------------------

function argumento(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`)
const lista = (valor: string) => valor.split(',').map((s) => s.trim()).filter(Boolean)

type Tamanho = { nome: string; width: number; height: number }
function parseLarguras(valor: string): Tamanho[] {
  return lista(valor).map((par) => {
    const [w, h] = par.split('x').map(Number)
    if (!w || !h) throw new Error(`--larguras: "${par}" não é WxH`)
    return { nome: `${w}x${h}`, width: w, height: h }
  })
}

// ---------------------------------------------------------------------------
// 2 · O CSS do app, compilado pelo mesmo motor do build
// ---------------------------------------------------------------------------
// Ver a explicação completa em `previa-itens.tsx` §2. `sabotarCss` acrescenta
// texto ao FIM da folha — é a alavanca da sabotagem K de
// `comparar-pixels-f61.mjs`: mudar um token do cromo (`--brand-dark`) sem
// mudar uma linha de `src/` e provar que o comparador realmente vê a diferença.
async function compilarCss(sabotarCss?: string): Promise<string> {
  const entrada = join(RAIZ, 'src', 'app', 'globals.css')
  const fonte = `${readFileSync(entrada, 'utf8')}\n@source "../../scripts/design";\n`
  const saida = await postcss([tailwind()]).process(fonte, { from: entrada })
  return sabotarCss ? `${saida.css}\n${sabotarCss}\n` : saida.css
}

// ---------------------------------------------------------------------------
// 3 · O ambiente de render — os contextos que o Next daria de graça
// ---------------------------------------------------------------------------
// Mesma técnica de `previa-itens.tsx` §3: roteador INERTE, contextos de rota
// preenchidos à mão. Cada vitrine é UMA rota fictícia (`/design-f61/<id>`) —
// o pathname não precisa ser o de produção porque nada aqui navega de
// verdade; o que importa é ele EXISTIR, para `usePathname()` não explodir.

const ROTEADOR = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
} as never

function Ambiente({
  pathname,
  busca = '',
  children,
}: {
  pathname: string
  busca?: string
  children: React.ReactNode
}) {
  return (
    <AppRouterContext.Provider value={ROTEADOR}>
      <PathnameContext.Provider value={pathname}>
        <SearchParamsContext.Provider value={new URLSearchParams(busca) as never}>
          <PathParamsContext.Provider value={{}}>
            <ProgressoNavegacaoProvider>
              <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
            </ProgressoNavegacaoProvider>
          </PathParamsContext.Provider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  )
}

// Ação inerte — os diálogos e listas que pedem uma função de callback. Nada
// aqui navega, salva ou fecha nada: é uma FOTO, não um app (mesmo raciocínio
// do roteador `ROTEADOR` acima).
function noop() {}

// ---------------------------------------------------------------------------
// 4 · O quadro — rótulo FORA, `data-quadro` no elemento medido
// ---------------------------------------------------------------------------

function Quadro({
  id,
  titulo,
  children,
}: {
  id: string
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2 border-t border-dashed pt-8 first:border-t-0 first:pt-0">
      {/* O RÓTULO FICA FORA de `[data-quadro]` de propósito: é ele que o
          medidor de bbox teria de ignorar se estivesse dentro, e a foto/o
          comparador de pixels não devem carregar texto de debug junto do
          conteúdo comparado. */}
      <p className="font-mono text-xs text-muted-foreground">
        {id} — {titulo}
      </p>
      <section data-quadro={id} className="bg-background">
        {children}
      </section>
    </div>
  )
}

/** Container de página de uma vitrine — largura de leitura, sem casco de app. */
function PaginaDaVitrine({
  vitrine,
  children,
}: {
  vitrine: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh space-y-8 bg-background p-6 text-foreground">
      <h1 className="text-lg font-semibold">
        F61 · prévia estática · vitrine <span className="font-mono">{vitrine}</span>
      </h1>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5 · Vitrine A — cromo
// ---------------------------------------------------------------------------

function VitrineCromo() {
  return (
    <PaginaDaVitrine vitrine="cromo">
      <Quadro id="login" titulo="src/app/login/page.tsx (inteira)">
        <LoginPage />
      </Quadro>

      <Quadro id="auth-confirmar" titulo="src/app/auth/confirm/page.tsx (link válido, ativação)">
        <ConfirmarPageResolvida />
      </Quadro>

      <Quadro id="app-header" titulo="AppHeader (cargo dev, com Nova movimentação)">
        <AppHeader
          nome={FULANO}
          papel="dev"
          email={EMAIL_FULANO}
          nomesDoEscopoEscrita={[FILIAL_CERRADO_ALTO.nome]}
          pendencias={3}
          podeEscrever
          eAdmin
          eDev
          hrefRelatorios="/relatorios/geral"
          versao={versaoAtual().versao}
        />
      </Quadro>

      <Quadro id="viewer-header" titulo="ViewerHeader (sessão por senha)">
        <ViewerHeader rotulo={`Filial ${FILIAL_CERRADO_ALTO.nome}`} />
      </Quadro>

      <Quadro id="acesso-form" titulo="src/components/relatorios/acesso-form.tsx">
        <AcessoForm next="" />
      </Quadro>

      <Quadro id="rodape-sidebar" titulo="RodapeSidebar (expandido)">
        <div className="w-60 border p-2">
          <RodapeSidebar versao={versaoAtual().versao} />
        </div>
      </Quadro>

      <Quadro id="sidebar-lateral" titulo="SidebarLateral (cargo admin, 3 pendências)">
        <div style={{ height: 420 }}>
          <SidebarLateral
            pendencias={3}
            eAdmin
            hrefRelatorios="/relatorios/geral"
            versao={versaoAtual().versao}
          />
        </div>
      </Quadro>

      <Quadro id="versoes-rodape" titulo="TRECHO COPIADO — o rodapé de (app)/versoes/page.tsx">
        {/* A página inteira é `async` e chama `getOperador()` (exige sessão) —
            só este parágrafo depende apenas de `versaoAtual()`, uma função
            PURA. Reproduzido byte a byte do arquivo de origem (ver o
            cabeçalho desta prévia). */}
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Estoque TI WAP · <span className="tabular-nums">v{versaoAtual().versao}</span> ·{' '}
          <CreditoAutor />
        </p>
      </Quadro>

      <Quadro id="marca-sobre-popover" titulo="Marca como no SheetTitle do menu mobile">
        <div className="w-72 rounded-md border bg-popover p-3 text-popover-foreground">
          <Marca />
        </div>
      </Quadro>

      <Quadro id="nao-encontrado" titulo="src/app/not-found.tsx">
        <NaoEncontrado />
      </Quadro>
    </PaginaDaVitrine>
  )
}

/**
 * `ConfirmarPage` é `async` (recebe `searchParams: Promise<...>`), e
 * `renderToStaticMarkup` não aceita Promise nenhuma — o elemento tem de já
 * estar RESOLVIDO antes de entrar no `render()`. Chamamos a função ASSÍNCRONA
 * fora do JSX (ver `main()`) e passamos o resultado pronto adiante; este
 * pequeno componente síncrono só existe para o `<Quadro>` acima poder tratar
 * a chamada como se fosse JSX comum. Ver `main()` — o `await` de verdade
 * acontece ali, antes de qualquer `renderToStaticMarkup`.
 */
function ConfirmarPageResolvida() {
  return RESOLVIDOS.confirmarPage ?? <p>Falha ao resolver ConfirmarPage — ver `main()`.</p>
}

// Pequena caixa de elementos já resolvidos por `await` antes do render — só o
// `ConfirmarPage` precisa disto (é a única página `async` desta vitrine).
const RESOLVIDOS: { confirmarPage: React.ReactNode | null } = { confirmarPage: null }

// ---------------------------------------------------------------------------
// 6 · Vitrine B — admin-tabelas
// ---------------------------------------------------------------------------

function VitrineAdminTabelas() {
  return (
    <PaginaDaVitrine vitrine="admin-tabelas">
      <Quadro id="tipos-item-tabela" titulo="TiposItemTabela (ativos e inativos)">
        <TiposItemTabela tipos={TIPOS_ITEM_ADMIN_PREVIA} />
      </Quadro>
      <Quadro id="tipos-item-tabela-vazio" titulo="TiposItemTabela (catálogo vazio)">
        <TiposItemTabela tipos={[]} />
      </Quadro>

      <Quadro id="itens-tabela" titulo="ItensTabela (ativos e inativos)">
        <ItensTabela itens={ITENS_ADMIN_PREVIA} tipos={TIPOS_ITEM_ATIVOS_PREVIA} />
      </Quadro>
      <Quadro id="itens-tabela-vazio" titulo="ItensTabela (catálogo vazio)">
        <ItensTabela itens={[]} tipos={TIPOS_ITEM_ATIVOS_PREVIA} />
      </Quadro>

      <Quadro id="colaboradores-tabela" titulo="ColaboradoresTabela (ativos e inativos)">
        <ColaboradoresTabela colaboradores={COLABORADORES_ADMIN_PREVIA} filiais={FILIAIS_PREVIA} />
      </Quadro>
      <Quadro id="colaboradores-tabela-vazio" titulo="ColaboradoresTabela (cadastro vazio)">
        <ColaboradoresTabela colaboradores={[]} filiais={FILIAIS_PREVIA} />
      </Quadro>

      <Quadro id="usuarios-tabela" titulo="UsuariosTabela (cargo admin logado)">
        <UsuariosTabela
          usuarios={USUARIOS_ADMIN_PREVIA}
          filiais={FILIAIS_PARA_VINCULO_PREVIA}
          euId={EU_ID_PREVIA}
          euPapel="admin"
        />
      </Quadro>

      <Quadro id="auditoria-tabela" titulo="AuditoriaTabela">
        <AuditoriaTabela linhas={EVENTOS_ADMIN_PREVIA} filiais={FILIAIS_PREVIA} />
      </Quadro>

      <Quadro id="auditoria-filtro" titulo="AuditoriaFiltro (sem filtro)">
        <AuditoriaFiltro acao={null} />
      </Quadro>

      <Quadro id="fila-consolidacao" titulo="FilaConsolidacao">
        <FilaConsolidacao
          fila={FILA_CONSOLIDACAO_PREVIA}
          resumo={RESUMO_CONSOLIDACAO_PREVIA}
          filiais={FILIAIS_PREVIA}
        />
      </Quadro>
    </PaginaDaVitrine>
  )
}

// Os quadros de `admin-tabelas` cujos selos "Ativo" entram no gabarito com
// zero pixel exigido (`comparar-pixels-f61.mjs` deriva `<quadro>--selo-N`
// destes três, no passo da FOTO — ver `capturarQuadros` abaixo).
const QUADROS_COM_SELO = ['tipos-item-tabela', 'itens-tabela', 'colaboradores-tabela']

// ---------------------------------------------------------------------------
// 7 · Vitrine C — admin-importar
// ---------------------------------------------------------------------------

function VitrineAdminImportar() {
  return (
    <PaginaDaVitrine vitrine="admin-importar">
      <Quadro id="tabela-erros-bloqueantes" titulo="TabelaErros (bloqueantes)">
        <TabelaErros erros={ERROS_BLOQUEANTES_PREVIA} />
      </Quadro>
      <Quadro id="tabela-erros-aviso" titulo="TabelaErros (avisos)">
        <TabelaErros erros={ERROS_AVISO_PREVIA} />
      </Quadro>

      <Quadro id="correcoes-aplicadas" titulo="CorrecoesAplicadas">
        <CorrecoesAplicadas
          correcoes={CORRECOES_APLICADAS_PREVIA}
          porOp={CORRECOES_POR_OP_PREVIA}
          pendente={false}
          onDesfazer={noop}
          patrimonioDoHostname={1}
        />
      </Quadro>

      <Quadro
        id="grupos-erros"
        titulo="GruposErros (correcao.kind: 'nenhuma' — os outros 9 kinds: sem vitrine, ver cabeçalho)"
      >
        <GruposErros
          grupos={GRUPOS_ERROS_PREVIA}
          contexto={CONTEXTO_IMPORT_PREVIA}
          filialNome={FILIAL_CERRADO_ALTO.nome}
          tiposAviso={TIPOS_AVISO_IMPORT_PREVIA}
          pendente={false}
          onCorrigir={noop}
          vocabulario={VOCABULARIO_CLIENTE_PREVIA}
        />
      </Quadro>
    </PaginaDaVitrine>
  )
}

// ---------------------------------------------------------------------------
// 8 · Vitrine D — admin-dialogos (exige o dublê de Dialog)
// ---------------------------------------------------------------------------

function VitrineAdminDialogos() {
  return (
    <PaginaDaVitrine vitrine="admin-dialogos">
      <Quadro id="filial-dialog-novo" titulo="FilialDialog (novo)">
        <FilialDialog />
      </Quadro>
      <Quadro id="filial-dialog-edicao" titulo="FilialDialog (edição)">
        <FilialDialog filial={FILIAL_EDIT_PREVIA} />
      </Quadro>

      <Quadro id="kit-dialog-novo" titulo="KitDialog (novo)">
        <KitDialog motivos={MOTIVOS_PREVIA} />
      </Quadro>
      <Quadro id="kit-dialog-edicao" titulo="KitDialog (edição)">
        <KitDialog kit={KIT_EDIT_PREVIA} motivos={MOTIVOS_PREVIA} />
      </Quadro>

      <Quadro id="motivo-dialog-novo" titulo="MotivoDialog (novo)">
        <MotivoDialog />
      </Quadro>
      <Quadro id="motivo-dialog-edicao" titulo="MotivoDialog (edição)">
        <MotivoDialog motivo={MOTIVO_EDIT_PREVIA} />
      </Quadro>

      <Quadro id="item-dialog-novo" titulo="ItemDialog (novo)">
        <ItemDialog />
      </Quadro>
      <Quadro id="item-dialog-edicao" titulo="ItemDialog (edição)">
        <ItemDialog item={ITEM_EDIT_PREVIA} />
      </Quadro>

      <Quadro id="tipo-item-dialog-novo" titulo="TipoItemDialog (novo)">
        <TipoItemDialog />
      </Quadro>
      <Quadro id="tipo-item-dialog-edicao" titulo="TipoItemDialog (edição)">
        <TipoItemDialog tipo={TIPO_ITEM_EDIT_PREVIA} />
      </Quadro>

      <Quadro id="colaborador-dialog-novo" titulo="ColaboradorDialog (novo)">
        <ColaboradorDialog filiais={FILIAIS_PREVIA} />
      </Quadro>
      <Quadro id="colaborador-dialog-edicao" titulo="ColaboradorDialog (edição)">
        <ColaboradorDialog colaborador={COLABORADOR_EDIT_PREVIA} filiais={FILIAIS_PREVIA} />
      </Quadro>

      <Quadro id="editar-usuario-dialog" titulo="EditarUsuarioDialog">
        <EditarUsuarioDialog {...EDITAR_USUARIO_PROPS_PREVIA} />
      </Quadro>

      <Quadro id="convidar-usuario-dialog" titulo="ConvidarUsuarioDialog">
        <ConvidarUsuarioDialog {...CONVIDAR_USUARIO_PROPS_PREVIA} />
      </Quadro>

      <Quadro id="criar-senha-dialog" titulo="CriarSenhaDialog">
        <CriarSenhaDialog />
      </Quadro>

      <Quadro id="testar-senha-dialog" titulo="TestarSenhaDialog">
        <TestarSenhaDialog id="s0000000-0000-4000-8000-000000000001" rotulo="Filial Cerrado Alto" />
      </Quadro>

      <Quadro id="gerar-link-acesso" titulo="GerarLinkAcesso (antes de gerar — link nulo)">
        <GerarLinkAcesso email={EMAIL_FULANO} nome={FULANO} />
      </Quadro>

      <Quadro id="encerrar-sessoes-dialog" titulo="EncerrarSessoesDialog">
        <EncerrarSessoesDialog
          usuarioId={USUARIOS_ADMIN_PREVIA[1].id}
          nome={FULANO}
          eVoceMesmo={false}
          open={false}
          onOpenChange={noop}
        />
      </Quadro>

      <Quadro id="apagar-usuario-dialog-com-email" titulo="ApagarUsuarioDialog (com e-mail)">
        <ApagarUsuarioDialog
          usuarioId={USUARIOS_ADMIN_PREVIA[1].id}
          nome={FULANO}
          email={EMAIL_FULANO}
          open={false}
          onOpenChange={noop}
        />
      </Quadro>
      <Quadro id="apagar-usuario-dialog-sem-email" titulo="ApagarUsuarioDialog (sem e-mail — Auth fora do ar)">
        <ApagarUsuarioDialog
          usuarioId={USUARIOS_ADMIN_PREVIA[1].id}
          nome={FULANO}
          email={null}
          open={false}
          onOpenChange={noop}
        />
      </Quadro>

      <Quadro id="gerar-relatorio-dialog" titulo="GerarRelatorioDialog">
        <GerarRelatorioDialog {...GERAR_RELATORIO_PROPS_PREVIA} />
      </Quadro>
    </PaginaDaVitrine>
  )
}

// ---------------------------------------------------------------------------
// 9 · Vitrine E — relatório
// ---------------------------------------------------------------------------

// A tabela de filtro isolada (`FiltrosTabela`) precisa das MESMAS formas que
// `useFiltrosTabela` devolveria — aqui construídas à mão, estáticas, porque a
// vitrine só quer a BARRA, não o comportamento.
const FILTROS_TABELA_OPCOES_PREVIA: Record<CampoFiltro, Opcao[]> = {
  filial: [],
  categoria: [
    { valor: 'notebook', rotulo: 'Notebook' },
    { valor: 'celular', rotulo: 'Celular' },
  ],
  motivo: [
    { valor: 'novo_colaborador', rotulo: 'Novo colaborador' },
    { valor: 'desligamento', rotulo: 'Desligamento' },
  ],
  tipo: [],
} as const

function VitrineRelatorio() {
  return (
    <PaginaDaVitrine vitrine="relatorio">
      <Quadro id="kpi-tiles" titulo="KpiTiles (sem Δ)">
        <KpiTiles kpis={KPIS_PREVIA} />
      </Quadro>
      <Quadro id="kpi-tiles-delta" titulo="KpiTiles (com Δ vs período anterior)">
        <KpiTiles kpis={KPIS_PREVIA} anterior={KPIS_ANTERIOR_PREVIA} periodo={PERIODO_PREVIA} />
      </Quadro>
      <Quadro id="grupo-kpis" titulo="GrupoKpis">
        <GrupoKpis kpis={KPIS_PREVIA} anterior={KPIS_ANTERIOR_PREVIA} periodo={PERIODO_PREVIA} />
      </Quadro>

      <Quadro id="card-relatorio" titulo="CardRelatorio (com chip de janela)">
        <CardRelatorio
          titulo="Saídas por motivo"
          subtitulo="período selecionado"
          janela="periodo"
          periodoJanela={PERIODO_PREVIA}
        >
          <p className="text-sm text-muted-foreground">Conteúdo de exemplo do cartão.</p>
        </CardRelatorio>
      </Quadro>
      <Quadro id="card-relatorio-vazio" titulo="CardRelatorio (vazio)">
        <CardRelatorio titulo="Transferências" vazio />
      </Quadro>

      <Quadro id="celulas" titulo="celulas.tsx — uma linha de demonstração">
        <Table>
          <TableBody>
            <TableRow>
              <CelulaData data="2026-09-08" />
              <CelulaPatrimonio
                patrimonio="WAP0001234"
                ativoId="00000000-0000-4000-8000-000000000001"
                ehOperador
                estornada
                estornoData="2026-09-09"
              />
              <td className="p-2">
                <PilulaTipo tipo="saida" />
              </td>
              <CelulaChamado chamado="8421" />
              <CelulaObs texto="Entregue com carregador e mochila." comIcone />
              <td className="p-2">
                <BadgeEstornada data="2026-09-09" />
              </td>
            </TableRow>
          </TableBody>
        </Table>
        <div className="mt-2">
          <CabecalhoDetalhe titulo="Saídas" total={6} exibidas={4} />
        </div>
      </Quadro>

      <Quadro id="tabela-saidas" titulo="TabelaSaidas">
        <TabelaSaidas rows={LINHAS_SAIDA_PREVIA} ehGeral ehOperador />
      </Quadro>
      <Quadro id="tabela-entradas" titulo="TabelaEntradas">
        <TabelaEntradas
          rows={LINHAS_ENTRADA_PREVIA}
          ehGeral
          rotulosTipo={MAPA_ROTULOS_TIPO_ITEM_PREVIA}
          ehOperador
        />
      </Quadro>
      <Quadro id="tabela-transferencias" titulo="TabelaTransferencias">
        <TabelaTransferencias rows={LINHAS_TRANSFERENCIA_PREVIA} ehGeral ehOperador />
      </Quadro>
      <Quadro id="tabela-movimentacoes" titulo="TabelaMovimentacoes (grade v1)">
        <TabelaMovimentacoes rows={MOVIMENTACOES_RELATORIO_PREVIA} filtrosInternos ehGeral />
      </Quadro>
      <Quadro id="tabela-mov-itens" titulo="TabelaMovItens">
        <TabelaMovItens rows={LANCAMENTOS_ITEM_PREVIA} ehGeral />
      </Quadro>
      <Quadro id="tabela-itens-grupo" titulo="TabelaItensGrupo">
        <TabelaItensGrupo itens={SALDOS_ITEM_PERIODO_PREVIA} mostrarAtrelados={false} />
      </Quadro>

      <Quadro id="filtros-tabela" titulo="FiltrosTabela (categoria + motivo, sem filtro ativo)">
        <FiltrosTabela
          campos={['categoria', 'motivo']}
          filtros={{ filial: '', categoria: '', motivo: '', tipo: '' }}
          opcoes={FILTROS_TABELA_OPCOES_PREVIA}
          temFiltro={false}
          setFiltro={noop}
          limpar={noop}
        />
      </Quadro>

      <Quadro id="grupo-colapsavel" titulo="GrupoColapsavel (sempre aberto)">
        <GrupoColapsavel
          id="previa-grupo"
          titulo="Equipamentos principais"
          descricao="notebooks, celulares e tablets"
          icone="principais"
          sempreAberto
        >
          <p className="text-sm text-muted-foreground">Conteúdo do grupo.</p>
        </GrupoColapsavel>
      </Quadro>

      <Quadro id="legenda-delta" titulo="LegendaDelta">
        <LegendaDelta />
      </Quadro>
      <Quadro id="legenda-estorno" titulo="LegendaEstorno">
        <LegendaEstorno />
      </Quadro>
      <Quadro id="legenda-troca" titulo="LegendaTroca">
        <LegendaTroca />
      </Quadro>
      <Quadro id="legenda-manutencao" titulo="LegendaManutencao">
        <LegendaManutencao casos={MANUTENCAO_CASOS_PREVIA} />
      </Quadro>
      <Quadro id="glossario-relatorio" titulo="GlossarioRelatorio">
        <GlossarioRelatorio />
      </Quadro>

      <Quadro id="lista-manutencao" titulo="ListaManutencao">
        <ListaManutencao itens={ITENS_MANUTENCAO_PREVIA} />
      </Quadro>
      <Quadro id="lista-modelo" titulo="ListaModelo">
        <ListaModelo itens={ITENS_MODELO_PREVIA} />
      </Quadro>
      <Quadro id="lista-modelo-categoria" titulo="ListaModeloCategoria">
        <ListaModeloCategoria grupos={MODELOS_POR_CATEGORIA_PREVIA} />
      </Quadro>
      <Quadro id="lista-reservados" titulo="ListaReservados">
        <ListaReservados itens={ITENS_RESERVADOS_PREVIA} />
      </Quadro>

      <Quadro id="manutencao-casos" titulo="ManutencaoCasos (caso em alerta + caso que voltou)">
        <ManutencaoCasos casos={MANUTENCAO_CASOS_PREVIA} ehOperador />
      </Quadro>

      <Quadro id="medidor-minimo-folga" titulo="MedidorMinimo (folga)">
        <MedidorMinimo estoque={10} minimo={5} />
      </Quadro>
      <Quadro id="medidor-minimo-atencao" titulo="MedidorMinimo (no limite)">
        <MedidorMinimo estoque={6} minimo={5} />
      </Quadro>
      <Quadro id="medidor-minimo-abaixo" titulo="MedidorMinimo (falta)">
        <MedidorMinimo estoque={3} minimo={5} />
      </Quadro>

      <Quadro id="observacao-card" titulo="ObservacaoCard">
        <ObservacaoCard texto="Semana com feriado; parte dos notebooks em trânsito entre filiais." />
      </Quadro>

      <Quadro id="resumo-periodo" titulo="ResumoPeriodoCard">
        <ResumoPeriodoCard resumo={RESUMO_PERIODO_PREVIA} />
      </Quadro>
    </PaginaDaVitrine>
  )
}

// ---------------------------------------------------------------------------
// 10 · Vitrine F — confirmações (ConfirmacaoDigitada × 4 telas × 3 estados)
// ---------------------------------------------------------------------------
//
// `futuras` é a API que a Frente D ainda vai acrescentar a `ConfirmacaoDigitada`
// (`mono?`, `exibirEsperado?`, `aviso?` — ver o cabeçalho da ordem de serviço).
// Tipado como `object` e espalhado DEPOIS das props de hoje: compila hoje (o
// componente simplesmente ignora chaves que não declara) e continua
// compilando/valendo quando as props nascerem — nada aqui muda nesse dia.

function VitrineConfirmacoes() {
  const futurasMono: object = { mono: true }
  const futurasSemEsperado: object = { exibirEsperado: false }
  const futurasAvisoSemEmail: object = {
    aviso:
      'Não foi possível ler o e-mail desta conta agora — sem ele não dá para confirmar qual conta seria apagada. Atualize a página e tente de novo.',
  }

  return (
    <PaginaDaVitrine vitrine="confirmacoes">
      <Quadro id="mesa-vazio" titulo="mesa de conflitos — vazio">
        <ConfirmacaoDigitada
          id="conflito-confirmacao"
          rotulo="Para confirmar, digite exatamente:"
          esperado="APAGAR 3"
          valor=""
          confere={false}
          onChange={noop}
          {...futurasMono}
        />
      </Quadro>
      <Quadro id="mesa-nao-confere" titulo="mesa de conflitos — não confere">
        <ConfirmacaoDigitada
          id="conflito-confirmacao"
          rotulo="Para confirmar, digite exatamente:"
          esperado="APAGAR 3"
          valor="APAGAR 2"
          confere={false}
          onChange={noop}
          {...futurasMono}
        />
      </Quadro>
      <Quadro id="mesa-confere" titulo="mesa de conflitos — confere">
        <ConfirmacaoDigitada
          id="conflito-confirmacao"
          rotulo="Para confirmar, digite exatamente:"
          esperado="APAGAR 3"
          valor="APAGAR 3"
          confere
          onChange={noop}
          {...futurasMono}
        />
      </Quadro>

      <Quadro id="importar-vazio" titulo="import (Substituir tudo) — vazio">
        <ConfirmacaoDigitada
          id="import-confirmacao"
          rotulo={
            <>
              Digite <span className="font-mono font-semibold">Cerrado Alto</span> para confirmar
            </>
          }
          esperado="Cerrado Alto"
          valor=""
          confere={false}
          onChange={noop}
          {...futurasSemEsperado}
        />
      </Quadro>
      <Quadro id="importar-nao-confere" titulo="import (Substituir tudo) — não confere">
        <ConfirmacaoDigitada
          id="import-confirmacao"
          rotulo={
            <>
              Digite <span className="font-mono font-semibold">Cerrado Alto</span> para confirmar
            </>
          }
          esperado="Cerrado Alto"
          valor="Cerrado"
          confere={false}
          onChange={noop}
          {...futurasSemEsperado}
        />
      </Quadro>
      <Quadro id="importar-confere" titulo="import (Substituir tudo) — confere">
        <ConfirmacaoDigitada
          id="import-confirmacao"
          rotulo={
            <>
              Digite <span className="font-mono font-semibold">Cerrado Alto</span> para confirmar
            </>
          }
          esperado="Cerrado Alto"
          valor="Cerrado Alto"
          confere
          onChange={noop}
          {...futurasSemEsperado}
        />
      </Quadro>

      <Quadro id="apagar-conta-vazio" titulo="apagar conta (dev) — vazio">
        <ConfirmacaoDigitada
          id="dev-apagar-confirmacao"
          rotulo="Para confirmar, digite o e-mail da conta"
          esperado={EMAIL_FULANO}
          valor=""
          confere={false}
          onChange={noop}
        />
      </Quadro>
      <Quadro id="apagar-conta-nao-confere" titulo="apagar conta (dev) — não confere">
        <ConfirmacaoDigitada
          id="dev-apagar-confirmacao"
          rotulo="Para confirmar, digite o e-mail da conta"
          esperado={EMAIL_FULANO}
          valor="fulano@exemplo.co"
          confere={false}
          onChange={noop}
        />
      </Quadro>
      <Quadro id="apagar-conta-confere" titulo="apagar conta (dev) — confere">
        <ConfirmacaoDigitada
          id="dev-apagar-confirmacao"
          rotulo="Para confirmar, digite o e-mail da conta"
          esperado={EMAIL_FULANO}
          valor={EMAIL_FULANO}
          confere
          onChange={noop}
        />
      </Quadro>
      <Quadro id="apagar-conta-sem-email" titulo="apagar conta (dev) — Auth fora do ar, sem e-mail">
        <ConfirmacaoDigitada
          id="dev-apagar-confirmacao"
          rotulo="Para confirmar, digite o e-mail da conta"
          esperado=""
          valor=""
          confere={false}
          onChange={noop}
          desabilitado
          {...futurasAvisoSemEmail}
        />
      </Quadro>

      <Quadro id="destrutivo-vazio" titulo="Zona destrutiva — vazio">
        <ConfirmacaoDigitada
          id="destrutivo-confirmacao"
          rotulo="Para confirmar, digite exatamente:"
          esperado="WAP0001234"
          valor=""
          confere={false}
          onChange={noop}
          {...futurasMono}
        />
      </Quadro>
      <Quadro id="destrutivo-nao-confere" titulo="Zona destrutiva — não confere">
        <ConfirmacaoDigitada
          id="destrutivo-confirmacao"
          rotulo="Para confirmar, digite exatamente:"
          esperado="WAP0001234"
          valor="WAP0001235"
          confere={false}
          onChange={noop}
          {...futurasMono}
        />
      </Quadro>
      <Quadro id="destrutivo-confere" titulo="Zona destrutiva — confere">
        <ConfirmacaoDigitada
          id="destrutivo-confirmacao"
          rotulo="Para confirmar, digite exatamente:"
          esperado="WAP0001234"
          valor="WAP0001234"
          confere
          onChange={noop}
          {...futurasMono}
        />
      </Quadro>
    </PaginaDaVitrine>
  )
}

// ---------------------------------------------------------------------------
// 11 · Vitrine G — selos de sucesso
// ---------------------------------------------------------------------------

function VitrineSelosSucesso() {
  return (
    <PaginaDaVitrine vitrine="selos-sucesso">
      <Quadro id="painel-sucesso" titulo="PainelSucesso (nova movimentação)">
        <PainelSucesso sucesso={SUCESSO_LOTE_PREVIA} onGerado={noop} onReiniciar={noop} />
      </Quadro>

      <Quadro id="status-badge" titulo="StatusBadge em_estoque (controle: não muda)">
        <StatusBadge status="em_estoque" />
      </Quadro>
    </PaginaDaVitrine>
  )
}

// ---------------------------------------------------------------------------
// 12 · Vitrine H — filtros de URL (controle: não deve mudar pixel)
// ---------------------------------------------------------------------------

function VitrineFiltros() {
  return (
    <PaginaDaVitrine vitrine="filtros">
      <Quadro id="itens-filtros" titulo="ItensFiltros">
        <ItensFiltros filiais={FILIAIS_PREVIA} filiaisSelecionadas={[]} />
      </Quadro>
      <Quadro id="historico-filtros" titulo="HistoricoFiltros">
        <HistoricoFiltros
          itens={ITENS_CATALOGO_PREVIA}
          filiais={FILIAIS_PREVIA}
          filiaisSelecionadas={[]}
        />
      </Quadro>
      <Quadro id="ativos-filtros" titulo="AtivosFiltros">
        <AtivosFiltros filiais={FILIAIS_PREVIA} filiaisSelecionadas={[]} />
      </Quadro>
      <Quadro id="pendencias-filtros" titulo="PendenciasFiltros">
        <PendenciasFiltros filiais={FILIAIS_PREVIA} filiaisSelecionadas={[]} tipo={null} q={null} />
      </Quadro>
      <Quadro id="lista-filtros" titulo="ListaFiltros (movimentações)">
        <ListaFiltros filiais={FILIAIS_PREVIA} filiaisSelecionadas={[]} mostrarFiltroAutor />
      </Quadro>
    </PaginaDaVitrine>
  )
}

// ---------------------------------------------------------------------------
// 13 · O registro de vitrines
// ---------------------------------------------------------------------------

const VITRINES: Record<string, () => React.ReactElement> = {
  cromo: VitrineCromo,
  'admin-tabelas': VitrineAdminTabelas,
  'admin-importar': VitrineAdminImportar,
  'admin-dialogos': VitrineAdminDialogos,
  relatorio: VitrineRelatorio,
  confirmacoes: VitrineConfirmacoes,
  'selos-sucesso': VitrineSelosSucesso,
  filtros: VitrineFiltros,
}

// ---------------------------------------------------------------------------
// 13b · A máscara dos nomes de filial REAIS
// ---------------------------------------------------------------------------
//
// Os dados desta prévia são 100% fictícios — mas três componentes REAIS trazem,
// no próprio código de produção, placeholders de exemplo com nome de filial de
// verdade (`filial-dialog.tsx`: "Ex.: Linhares"; `filial-apelidos.tsx` e
// `criar-senha-dialog.tsx`: "CD Afonso Pena"), os mesmos que
// `src/lib/import/sem-wapismo.test.ts` permite por arquivo:linha. A regra 2 do
// `CLAUDE.md` não quer nome de filial real em evidência nenhuma, então a SAÍDA
// desta ferramenta os troca por "Filial de exemplo" — antes de gravar o HTML e,
// portanto, antes da foto. É um DUBLÊ DE TEXTO, declarado: a mesma troca nas duas
// passadas ("antes" e "depois") não muda a comparação. A expressão é a
// `NOMES_FILIAL` da `sem-wapismo`.
const NOMES_DE_FILIAL_REAIS = /\b(matriz|afonso\s+pena|linhares|serra|eus[eé]bio)\b/gi

function mascararNomesDeFilial(html: string): string {
  return html.replace(NOMES_DE_FILIAL_REAIS, 'Filial de exemplo')
}

// ---------------------------------------------------------------------------
// 14 · O documento
// ---------------------------------------------------------------------------

function documento({
  css,
  corpo,
  tema,
  titulo,
}: {
  css: string
  corpo: string
  tema: 'claro' | 'escuro'
  titulo: string
}): string {
  return `<!doctype html>
<html lang="pt-BR" class="${tema === 'escuro' ? 'dark ' : ''}h-full antialiased">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>${css}</style>
</head>
<body class="min-h-svh bg-background text-foreground">${corpo}</body>
</html>
`
}

// ---------------------------------------------------------------------------
// 15 · O HTML normalizado — determinístico, sem CSS, sem id de `useId()`
// ---------------------------------------------------------------------------
//
// O formato REAL, medido em 17/09/2026 com `renderToStaticMarkup` + React
// 19.2.8, sem `identifierPrefix`: `_R_gq_`, `_R_j3pljq_`… (maiúsculo,
// alfanumérico, sublinhado nas pontas — NÃO o `:r0:` de versões anteriores do
// React nem o `«r0»` que alguns Server Components produzem). Os outros dois
// padrões ficam de guarda: se o formato mudar numa atualização do React, o
// padrão novo é só mais uma entrada nesta lista — nenhum dos três quebra os
// outros dois porque cada `matchAll` roda por conta própria.
const PADROES_USE_ID = [/_R_[0-9a-zA-Z]+_/g, /:r[0-9a-z]+:/g, /«r[0-9a-z]+»/g]

function normalizarIds(html: string): string {
  const achados: string[] = []
  const vistos = new Set<string>()
  for (const padrao of PADROES_USE_ID) {
    for (const m of html.matchAll(padrao)) {
      if (!vistos.has(m[0])) {
        vistos.add(m[0])
        achados.push(m[0])
      }
    }
  }
  // Ordem de APARIÇÃO no texto, não a ordem entre os três padrões — um id de
  // um padrão pode aparecer antes de um id de outro no HTML final.
  achados.sort((a, b) => html.indexOf(a) - html.indexOf(b))

  let saida = html
  achados.forEach((id, i) => {
    // Escapa os metacaracteres de regex do próprio id (`:`, `«`, `»` não são
    // especiais, mas o hífen dentro de `[...]` seria se um dia entrasse) antes
    // de trocar TODAS as ocorrências — inclusive dentro de
    // `aria-describedby="…"` / `for="…"`, que citam o MESMO texto.
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    saida = saida.replace(new RegExp(escapado, 'g'), `Q${i}`)
  })
  return saida
}

function quebrarUmaTagPorLinha(html: string): string {
  return html
    .replace(/</g, '\n<')
    .split('\n')
    .map((linha) => linha.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/^\n+/, '')
}

function normalizarCorpo(corpo: string, cssSha256: string): string {
  const semIds = normalizarIds(corpo)
  const quebrado = quebrarUmaTagPorLinha(semIds)
  return `<!-- CSS sha256:${cssSha256} (o <style> real não entra no normalizado — ver comparar-pixels-f61.mjs) -->\n${quebrado}\n`
}

// ---------------------------------------------------------------------------
// 16 · A foto
// ---------------------------------------------------------------------------

// Flags que reduzem o ruído sub-pixel do rasterizador — medido na bancada
// (17/09/2026): sem elas, uma fração pequena das fotos (2-3 quadros em 103,
// tipicamente uma faixa de 2px perto de uma borda) mudava alguns pixels entre
// duas passadas do MESMO código, sem CSS nem DOM diferentes. `--disable-lcd-text`
// tira a variação de hinting de subpixel da fonte; `--force-color-profile=srgb`
// fixa o perfil de cor (sem ele, o perfil "do sistema" pode diferir entre
// processos); `--run-all-compositor-stages-before-draw` +
// `--disable-checker-imaging` são o par que ferramentas de regressão visual
// (Percy, BackstopJS) usam para o compositor terminar TODO o trabalho antes do
// screenshot, em vez de arriscar capturar um frame parcialmente composto.
const FLAGS_RENDER_DETERMINISTICO = [
  '--disable-lcd-text',
  '--force-color-profile=srgb',
  '--run-all-compositor-stages-before-draw',
  '--disable-checker-imaging',
  // Rasterização por SOFTWARE, não pela GPU — a origem mais provável do
  // resíduo de não-determinismo medido na bancada (o driver gráfico entra na
  // conta; a CPU não varia entre processos do mesmo jeito).
  '--disable-gpu',
  '--disable-gpu-compositing',
  // A fonte sem hinting e sem posicionamento sub-pixel: o glifo cai sempre na
  // mesma grade, e a rasterização do texto deixa de depender do processo.
  '--font-render-hinting=none',
  '--disable-font-subpixel-positioning',
  // Um fio de rasterização só: com vários, a borda arredondada de um campo que
  // cai na junção de dois ladrilhos era desenhada por fios diferentes a cada
  // passada (medido: 4 a 10 pixels na borda de baixo dos filtros).
  '--num-raster-threads=1',
  '--disable-partial-raster',
]

async function abrirNavegador() {
  const { chromium } = await import('playwright')
  try {
    return await chromium.launch({ args: FLAGS_RENDER_DETERMINISTICO })
  } catch (erro) {
    console.warn(
      `⚠ Chromium do Playwright indisponível (${(erro as Error).message}); tentando o Chrome do sistema…`,
    )
    return await chromium.launch({ channel: 'chrome', args: FLAGS_RENDER_DETERMINISTICO })
  }
}

/**
 * Desliga toda animação/transição/cursor piscando — a foto tem de ser a MESMA
 * nas duas rodadas — e as decorações NATIVAS que o próprio Chromium injeta
 * dentro de um `<input type="password">` (o ícone de "revelar senha", o botão
 * de autofill de credencial). Medido na bancada: `acesso-form.tsx` (REAL) tem
 * um campo de senha com `autoFocus`, e essas decorações do NAVEGADOR — não do
 * app — aparecem de forma ASSÍNCRONA e às vezes não terminam de desenhar a
 * tempo do screenshot, produzindo uma faixa de ~600 pixels que muda entre duas
 * rodadas do MESMO HTML (confirmado: os dois `.html` saem byte a byte iguais,
 * só o `.png` diverge). `blur()` (ver `semFoco`) não bastou porque a decoração
 * é do CAMPO, não do foco. É pseudo-elemento do MOTOR, nunca visto pelo `cn()`
 * nem pela régua de classes — desligá-lo aqui não é gambiarra de teste, é
 * igualar a foto ao que o app realmente pede (nenhuma classe pede esse ícone).
 */
const CSS_SEM_ANIMACAO = `
*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
input[type="password"]::-webkit-credentials-auto-fill-button,
input[type="password"]::-webkit-strong-password-auto-fill-button,
input::-webkit-textfield-decoration-container,
input::-ms-reveal,
input::-ms-clear{display:none!important;visibility:hidden!important}
*{-webkit-font-smoothing:antialiased!important;text-rendering:optimizeSpeed!important}
`

/**
 * Tira o foco de QUALQUER elemento antes da foto.
 *
 * `acesso-form.tsx` (REAL) marca o campo de senha com `autoFocus` — e um
 * `autoFocus` de verdade FOCA o elemento assim que a página carrega, anel de
 * foco (`:focus-visible`) incluso. Medido na bancada: esse anel é a fonte de
 * uma pequena fração de fotos não-determinísticas entre duas rodadas do MESMO
 * código (o Chromium nem sempre decide "veio de autofocus, não desenha o
 * anel" da mesma forma entre processos). Tirar o foco aqui — e não mexer no
 * componente, que não é nosso — é o que faz a foto parar de depender dessa
 * decisão do navegador.
 */
function semFoco() {
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}

type Bbox = { x: number; y: number; width: number; height: number }
type MedidaFoto = {
  vitrine: string
  tema: string
  largura: number
  altura: number
  scrollWidth: number
  clientWidth: number
  rolaHorizontal: boolean
  quadros: Record<string, Bbox>
}

// ---------------------------------------------------------------------------
// 17 · Main
// ---------------------------------------------------------------------------

async function main() {
  const vitrinesPedidas = lista(argumento('vitrines', Object.keys(VITRINES).join(',')))
  for (const v of vitrinesPedidas) {
    if (!(v in VITRINES)) {
      throw new Error(`vitrine "${v}" não existe. Disponíveis: ${Object.keys(VITRINES).join(', ')}`)
    }
  }
  const saida = argumento('saida', 'docs/f61-evidencias/previa')
  const tamanhos = parseLarguras(argumento('larguras', '1440x900,390x844'))
  const temas = lista(argumento('temas', 'claro,escuro')) as ('claro' | 'escuro')[]
  const sabotarCss = temFlag('sabotar-css') ? argumento('sabotar-css', '') : undefined
  const capturarQuadros = argumento('capturar-quadros', 'sim') !== 'nao'

  const dir = resolve(RAIZ, saida)
  mkdirSync(dir, { recursive: true })

  // Limpa só o que esta passada regrava — os arquivos das vitrines PEDIDAS
  // (e o `medidas.json` só quando ele será regravado). Uma passada com
  // `--vitrines cromo` não apaga as fotos de `relatorio` de uma passada
  // anterior no MESMO diretório.
  for (const nome of readdirSync(dir)) {
    const pertenceAVitrinePedida = vitrinesPedidas.some(
      (v) => nome === `${v}__` || nome.startsWith(`${v}__`),
    )
    if (pertenceAVitrinePedida) {
      try {
        unlinkSync(join(dir, nome))
      } catch {
        // diretório (não deveria haver nenhum) — ignora
      }
    }
  }
  if (capturarQuadros) {
    try {
      unlinkSync(join(dir, 'medidas.json'))
    } catch {
      // primeira passada — arquivo ainda não existe
    }
  }

  console.log('… compilando o CSS do app a partir de src/app/globals.css')
  const css = await compilarCss(sabotarCss)
  const cssSha256 = createHash('sha256').update(css).digest('hex')
  console.log(`  ${(css.length / 1024).toFixed(0)} kB de CSS (sha256 ${cssSha256.slice(0, 12)}…)`)
  if (sabotarCss) console.log(`  ⚠ --sabotar-css ativo: "${sabotarCss}"`)

  // `ConfirmarPage` é a única página `async` desta prévia — resolvida ANTES de
  // qualquer `renderToStaticMarkup` (ver o comentário de `ConfirmarPageResolvida`).
  RESOLVIDOS.confirmarPage = await ConfirmarPage({
    searchParams: Promise.resolve({ token_hash: 'previa-token', type: 'invite' }),
  })

  const paginas: { vitrine: string; arquivo: string; tema: string }[] = []
  for (const vitrine of vitrinesPedidas) {
    const Vitrine = VITRINES[vitrine]
    for (const tema of temas) {
      const corpo = mascararNomesDeFilial(renderToStaticMarkup(
        <Ambiente pathname={`/design-f61/${vitrine}`}>
          <Vitrine />
        </Ambiente>,
      ))
      const nomeHtml = `${vitrine}__${tema}.html`
      const titulo = `F61 · ${vitrine} · ${tema}`
      // O `autofocus` do campo de senha de `acesso-form.tsx` (REAL) sai SÓ do documento
      // da FOTO: o Chromium aplica o autofoco num passo de renderização assíncrono,
      // e o `blur()` de `semFoco` às vezes chega antes dele — medido na bancada
      // (17/09/2026): ~700 pixels do campo mudavam entre duas passadas do MESMO
      // HTML. O normalizado continua com o atributo, que é o que o React renderiza.
      writeFileSync(
        join(dir, nomeHtml),
        documento({ css, corpo: corpo.replace(/ autofocus=""/g, ''), tema, titulo }),
      )
      writeFileSync(
        join(dir, `${vitrine}__${tema}.normalizado.html`),
        normalizarCorpo(corpo, cssSha256),
      )
      paginas.push({ vitrine, arquivo: nomeHtml, tema })
      console.log(`  ${nomeHtml}`)
    }
  }

  if (temFlag('so-html')) {
    console.log(`\n✔ ${paginas.length} páginas em ${saida} (sem foto: --so-html)`)
    return
  }

  const navegador = await abrirNavegador()

  // AQUECIMENTO — uma foto DESCARTADA antes da primeira de verdade.
  //
  // Medido na bancada (17/09/2026): as primeiras fotos de um processo do
  // Chromium recém-lançado (sempre as da vitrine `cromo`, a primeira do
  // registro) tinham uma fração pequena de pixels de TEXTO não-determinística
  // entre duas rodadas do MESMO HTML — confirmado que o HTML era idêntico byte
  // a byte, então é o rasterizador de fonte "esfriado" (cache de glifos/shader
  // ainda não montado) que varia. Nenhuma flag de lançamento eliminou isso
  // sozinha; renderizar (e descartar) uma página com o MESMO CSS antes da
  // primeira foto de verdade aquece esse cache uma vez só, fora da contagem.
  {
    const aquecimento = await navegador.newContext({ viewport: { width: 1440, height: 900 } })
    const paginaAquecimento = await aquecimento.newPage()
    await paginaAquecimento.setContent(
      documento({ css, corpo: '<div style="padding:2rem"><h1>Estoque TI WAP</h1><p>Aquecimento do rasterizador.</p></div>', tema: 'claro', titulo: 'aquecimento' }),
    )
    await paginaAquecimento.evaluate(() => document.fonts.ready)
    await paginaAquecimento.screenshot()
    await aquecimento.close()
  }

  let fotos = 0
  const medidas: MedidaFoto[] = []
  try {
    for (const { vitrine, arquivo, tema } of paginas) {
      for (const tamanho of tamanhos) {
        const contexto = await navegador.newContext({
          viewport: { width: tamanho.width, height: tamanho.height },
          locale: 'pt-BR',
          deviceScaleFactor: 1,
        })
        const pagina = await contexto.newPage()
        await pagina.addStyleTag({ content: CSS_SEM_ANIMACAO })
        await pagina.goto(pathToFileURL(join(dir, arquivo)).href, { waitUntil: 'load' })
        // Fontes (não há `@font-face` no app — ver o cabeçalho — mas
        // `document.fonts.ready` não tem custo e cobre o dia em que houver).
        await pagina.evaluate(() => document.fonts.ready)
        await pagina.evaluate(semFoco)

        const png = `${arquivo.replace(/\.html$/, '')}__${tamanho.nome}.png`
        await pagina.screenshot({ path: join(dir, png), fullPage: true })
        fotos += 1
        console.log(`  ${png}`)

        const info = await pagina.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        if (info.scrollWidth > info.clientWidth) console.warn(`  ⚠ ${png} rola na horizontal`)

        if (capturarQuadros) {
          // ⚠ `page.evaluate` serializa a função para rodar DENTRO do navegador —
          // ela não enxerga closure nenhuma do processo Node (`QUADROS_COM_SELO`
          // incluído). Por isso ele entra como ARGUMENTO explícito, não por
          // referência de módulo — o erro de quem esquece isso é
          // "ReferenceError" dentro do navegador, não um erro de tipo.
          const quadros = await pagina.evaluate((quadrosComSelo: string[]) => {
            const mapa: Record<string, { x: number; y: number; width: number; height: number }> = {}
            for (const el of Array.from(document.querySelectorAll('[data-quadro]'))) {
              const id = el.getAttribute('data-quadro')
              if (!id) continue
              const r = (el as HTMLElement).getBoundingClientRect()
              mapa[id] = {
                x: Math.round(r.x + window.scrollX),
                y: Math.round(r.y + window.scrollY),
                width: Math.round(r.width),
                height: Math.round(r.height),
              }
              // Os selos "Ativo" — só nos quadros nomeados, só os 3 primeiros.
              if (quadrosComSelo.includes(id)) {
                const selos = Array.from(el.querySelectorAll('[data-slot="badge"]')).slice(0, 3)
                selos.forEach((selo, i) => {
                  const rs = (selo as HTMLElement).getBoundingClientRect()
                  mapa[`${id}--selo-${i + 1}`] = {
                    x: Math.round(rs.x + window.scrollX),
                    y: Math.round(rs.y + window.scrollY),
                    width: Math.round(rs.width),
                    height: Math.round(rs.height),
                  }
                })
              }
            }
            return mapa
          }, QUADROS_COM_SELO)
          medidas.push({
            vitrine,
            tema,
            largura: tamanho.width,
            altura: tamanho.height,
            scrollWidth: info.scrollWidth,
            clientWidth: info.clientWidth,
            rolaHorizontal: info.scrollWidth > info.clientWidth,
            quadros,
          })
        }
        await contexto.close()
      }
    }
  } finally {
    await navegador.close()
  }

  if (capturarQuadros) {
    writeFileSync(join(dir, 'medidas.json'), `${JSON.stringify(medidas, null, 2)}\n`)
    console.log(`  medidas.json (${medidas.length} fotos)`)
  }

  console.log(`\n✔ ${paginas.length} páginas e ${fotos} imagens em ${saida}`)
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
