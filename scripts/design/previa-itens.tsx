#!/usr/bin/env -S npx tsx
// A PRÉVIA ESTÁTICA DE `/itens` — fotografar o COMPONENTE REAL sem banco (F43).
//
// ============================================================================
// POR QUE ESTA FERRAMENTA EXISTE
// ============================================================================
// `scripts/design/capturar.mjs` fotografa a tela DE VERDADE, subindo um
// `next dev` — e por isso ele exige um `--ref-esperado` que NÃO seja produção
// (regra 2 do `CLAUDE.md`: nada de nome, patrimônio ou linha de planilha real em
// screenshot). Este repositório não tem `.env.ensaio`, e o `.env.local` aponta
// para produção: pelo caminho dele, a F42 não conseguiu fotografar nada e
// registrou a limitação em `docs/DECISOES.md` (31/08/2026).
//
// A F43 é uma fase de LEGIBILIDADE: sem imagem, não há prova. Então o caminho
// muda de lugar — em vez de fotografar a tela de produção com dados reais,
// renderiza-se o COMPONENTE REAL com dados 100% FICTÍCIOS
// (`previa-itens-dados.ts`) e fotografa-se isso.
//
//   · React roda em `renderToStaticMarkup` (react-dom 19.2.8, já é dependência);
//   · o CSS sai do PRÓPRIO `src/app/globals.css`, compilado pelo
//     `@tailwindcss/postcss` que o `next build` também usa — nada de folha
//     paralela escrita à mão;
//   · o Playwright (já é devDependency, aprovado em 30/08/2026) tira a foto.
//
// Nenhuma dependência nova (regra 3). Nenhum acesso a banco. Nenhum `.env` lido.
//
// ============================================================================
// O QUE É REAL NA FOTO, E O QUE É DUBLÊ — leia antes de confiar na imagem
// ============================================================================
// REAL (importado de `src/`, exatamente o que vai ao ar):
//   `Pagina`, `CabecalhoDaPagina`, `ItensFiltros`, `ItensTable`,
//   `AtivosPaginacao`, `EstadoVazio`, `RealtimeRefresh`, `ExportarCsvButton`,
//   `LancarItemDialog`, `TransferirItemDialog`, `BadgeRepor`, e todo o kit
//   `components/ui/`. O CSS é o do app.
// DUBLÊ (desenhado aqui, porque depende de sessão/rota que não existe fora do
// Next):
//   o cabeçalho superior e a barra lateral do app — reproduzidos com as MESMAS
//   medidas do `(app)/layout.tsx` (header `h-14`, `aside` `w-60` a partir de
//   `md`, `main` com `p-4 md:p-6`) para que a LARGURA ÚTIL da foto seja a mesma
//   da tela real. Os rótulos do menu são os do produto; nenhum dado.
// NÃO EXISTE na foto: a fonte Geist (vem do `next/font`, que só roda dentro do
//   Next). Cai no fallback declarado no próprio `globals.css` — system-ui.
//
// ============================================================================
// USO
// ============================================================================
// ⚠ O `--tsconfig scripts/design/tsconfig.previa.json` NÃO é opcional: ele troca
// o pacote `server-only` por um módulo vazio. Fora do bundler do Next, a
// resolução de `server-only` cai no `index.js`, que LANÇA no import — e
// `NUMEROS_ITEM` mora em `lib/ajuda/`, que é só-servidor. Ver
// `scripts/design/vazio-servidor.ts`.
//
//   npx tsx --tsconfig scripts/design/tsconfig.previa.json \
//     scripts/design/previa-itens.tsx --saida docs/f43-evidencias/antes
//   … --variantes atual,a,b --saida docs/f43-evidencias/variantes
//   … --so-html   (sem Playwright)
//
//   --variantes   lista separada por vírgula (padrão: `atual`)
//   --saida       pasta de destino (padrão: `docs/f43-evidencias/previa`)
//   --larguras    padrão `1440x900,390x844`
//   --temas       padrão `claro,escuro`
//   --cenarios    padrão `padrao` (`consulta` = sem menu de ações; `vazio-filtro`,
//                 `vazio-cargo`, `vazio-catalogo` = os três estados vazios)
//   --recortes    padrão `sem` — quais filiais estão marcadas no filtro
//                 (`sem` = nenhuma · `uma` = Cerrado Alto · `tres` = Aurora,
//                 Cerrado Alto e Estância Velha do Norte)
//   --so-html     não fotografa; só grava o HTML
//
// A pasta de saída é sempre limpa dos arquivos que esta passada regrava.
//
// ⚠ F44 — O RECORTE ENTROU, e sem ele esta ferramenta não servia para a fase.
// Até a v1.48.0 a prévia fotografava SÓ a tela sem filtro — justamente o único
// caso em que a legenda "tudo que a TI possui" não mente. O defeito que a F44
// conserta só existe COM filtro, então uma prévia que não sabe filtrar
// fotografaria a tela certa e provaria nada.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ClipboardCheck, ScrollText } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  PathParamsContext,
  PathnameContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime'

import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import { ProgressoNavegacaoProvider } from '@/components/layout/progresso-navegacao'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { ItensFiltros } from '@/components/itens/itens-filtros'
import { ResumoDeItens } from '@/components/itens/resumo-de-itens'
import { LancarItemDialog } from '@/components/itens/lancar-item-dialog'
import { TransferirItemDialog } from '@/components/itens/transferir-item-dialog'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'
import { NUMEROS_ITEM } from '@/lib/ajuda/conteudo/itens-por-quantidade'
import { cabecalhosComEscopo, escopoDosNumeros } from '@/lib/itens/escopo'
import { ordenarSaldos, paginarLinhas, rotuloSubtituloItens } from '@/lib/itens/lista'
import { resumoDaLista } from '@/lib/itens/distribuicao'
import { TAMANHOS_PAGINA } from '@/lib/ativos/lista'

import {
  FILIAIS_PREVIA,
  catalogoDaPrevia,
  linhasDaPrevia,
  minimosDaPrevia,
} from './previa-itens-dados'
import { VARIANTES, type PropsDaTabela } from './previa-itens-variantes'

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

/**
 * `src/app/globals.css` processado pelo `@tailwindcss/postcss`.
 *
 * O `@source` extra existe porque a varredura automática do Tailwind v4 parte do
 * arquivo CSS e não teria motivo para olhar `scripts/` — e é lá que moram as
 * variantes candidatas de desenho. Sem ele, a classe existiria no HTML e não no
 * CSS, e a foto sairia sem estilo justamente do que se quer avaliar.
 *
 * ⚠ A folha NÃO é escrita à mão em lugar nenhum: mudou um token no `globals.css`,
 * a próxima passada já fotografa com ele.
 */
async function compilarCss(): Promise<string> {
  const entrada = join(RAIZ, 'src', 'app', 'globals.css')
  const fonte = `${readFileSync(entrada, 'utf8')}\n@source "../../scripts/design";\n`
  const saida = await postcss([tailwind()]).process(fonte, { from: entrada })
  return saida.css
}

// ---------------------------------------------------------------------------
// 3 · O ambiente de render — os contextos que o Next daria de graça
// ---------------------------------------------------------------------------
//
// `ItensFiltros`, `AtivosPaginacao`, `ExportarCsvButton` e os dois diálogos são
// Client Components que chamam `useRouter`/`usePathname`/`useSearchParams`. Fora
// do Next esses hooks leem contextos que ninguém preencheu. Preenchê-los aqui é
// o que permite renderizar o componente REAL em vez de uma cópia — é a mesma
// técnica que as integrações de Storybook com Next usam.
//
// O roteador é INERTE de propósito: a prévia é uma foto, não um app. Clique
// nenhum navega, e é isso que se quer.

const ROTEADOR = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
} as never

function Ambiente({ busca, children }: { busca: string; children: React.ReactNode }) {
  return (
    <AppRouterContext.Provider value={ROTEADOR}>
      <PathnameContext.Provider value="/itens">
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

// ---------------------------------------------------------------------------
// 4 · O dublê do casco do app — só para a largura útil ser a de verdade
// ---------------------------------------------------------------------------

const ITENS_DO_MENU = [
  'Início',
  'Ativos',
  'Movimentações',
  'Itens',
  'Pendências',
  'Relatórios',
  'Administração',
  'Ajuda',
]

/** Cabeçalho + barra lateral com as MESMAS medidas do `(app)/layout.tsx`. */
function CascoDublê({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 bg-brand-dark px-4 text-white md:px-6">
        <span className="rounded-sm bg-brand-amarelo px-1.5 text-xs font-bold text-black">
          WAP
        </span>
        <span className="text-sm font-medium">Estoque TI</span>
        <span className="ml-auto text-xs text-white/70">prévia · dados fictícios</span>
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 self-start border-r bg-background p-3 md:block">
          <nav className="flex flex-col gap-1">
            {ITENS_DO_MENU.map((rotulo) => (
              <span
                key={rotulo}
                className={
                  rotulo === 'Itens'
                    ? 'flex h-10 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground'
                    : 'flex h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground'
                }
              >
                {rotulo}
              </span>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5 · O miolo — a MESMA composição de `src/app/(app)/itens/page.tsx`
// ---------------------------------------------------------------------------

type Cenario = 'padrao' | 'consulta' | 'vazio-filtro' | 'vazio-cargo' | 'vazio-catalogo'

const CATALOGO = catalogoDaPrevia()
const MINIMOS = minimosDaPrevia()

/**
 * OS TRÊS RECORTES DE FILIAL que a F44 precisa fotografar.
 *
 * `uma` escolhe **Cerrado Alto** de propósito: é uma filial do MEIO da lista, e
 * não a primeira — com a primeira, a coluna redundante da matriz e a coluna
 * "Em estoque" ficariam coladas, e a foto esconderia o problema em vez de
 * mostrá-lo. `tres` pula filiais (1, 3 e 5) pelo mesmo motivo: a soma tem de ser
 * visivelmente diferente do consolidado.
 */
const RECORTES: Record<string, { rotulo: string; filialIds: number[] }> = {
  sem: { rotulo: 'sem filtro de filial', filialIds: [] },
  uma: { rotulo: 'uma filial marcada (Cerrado Alto)', filialIds: [3] },
  tres: { rotulo: 'três filiais marcadas', filialIds: [1, 3, 5] },
}

/** A Server Action do export é assíncrona e não roda na prévia — dublê inerte. */
const EXPORT_INERTE = async () => ({
  nome: 'previa.csv',
  conteudo: '',
  exportadas: 0,
  total: 0,
  truncado: false,
  erro: undefined,
})

function Miolo({
  variante,
  cenario,
  recorte,
}: {
  variante: keyof typeof VARIANTES
  cenario: Cenario
  recorte: string
}) {
  const escreve = cenario !== 'consulta'
  // ⚠ AS MESMAS TRÊS CONDIÇÕES DA `page.tsx`, e não "escreve" para tudo: Conferir
  // exige ao menos UMA filial de escrita, Transferir exige DUAS (não se transfere
  // sem destino). Uma prévia que afrouxa a regra de cargo fotografa uma tela que
  // não existe para ninguém.
  const filiaisEscrita = escreve ? FILIAIS_PREVIA : []
  const Tabela = VARIANTES[variante].Tabela

  // ⚠ AS MESMAS DUAS LINHAS DA `page.tsx` (linhas 122-145): `filialIds` recorta os
  // NÚMEROS e `filiaisVisiveis` são as colunas da matriz. Nada aqui é
  // reimplementação — `linhasDaPrevia` chama `montarLinhasDeItem`, a função de
  // verdade.
  const filialIds = RECORTES[recorte].filialIds
  const filiaisVisiveis =
    filialIds.length > 0
      ? FILIAIS_PREVIA.filter((f) => filialIds.includes(f.id))
      : FILIAIS_PREVIA
  const linhas = ordenarSaldos(linhasDaPrevia(filialIds))
  const pagina = paginarLinhas(linhas, 1, 25)
  // F44 — a MESMA derivação da `page.tsx`: o escopo sai de `filialIds`, e a
  // legenda com escopo sai de `NUMEROS_ITEM` por função pura.
  const escopo = escopoDosNumeros(FILIAIS_PREVIA, filialIds)
  const cabecalhos = cabecalhosComEscopo(NUMEROS_ITEM, escopo)
  const props: PropsDaTabela = {
    rows: pagina.rows,
    filiais: filiaisVisiveis,
    minimos: MINIMOS,
    escreve,
    filialPreset: filialIds.length === 1 ? filialIds[0] : null,
    filiaisTransferencia: FILIAIS_PREVIA.map((f) => f.id),
    cabecalhos,
    escopo,
  }

  const vazio = cenario.startsWith('vazio')
  // O recorte vem do FILTRO (é o que a foto quer mostrar), então ele conta como
  // filtro na URL — a mesma leitura que `ehFiltroDeFilial` faz na `page.tsx`.
  const temFiltro = cenario === 'vazio-filtro' || filialIds.length > 0
  const temRecorteFilial =
    cenario === 'vazio-cargo' ||
    (filialIds.length > 0 && filialIds.length < FILIAIS_PREVIA.length)

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Itens por quantidade"
        ajuda="itens-por-quantidade"
        ajudaRotulo="Ajuda sobre itens por quantidade"
        descricao={rotuloSubtituloItens({
          total: vazio ? 0 : pagina.total,
          temFiltro,
          temRecorteFilial,
        })}
        acoes={
          <>
            <RealtimeRefresh />
            <ExportarCsvButton
              acao={EXPORT_INERTE}
              rotulo="Exportar saldos"
              descricao="dos itens filtrados"
            />
            {/* Os DOIS botões de link são montados aqui, e não importados: eles
                não são componente — são `<Button asChild><Link>` escritos dentro
                da `page.tsx`. O que a prévia deve garantir é que sejam o MESMO
                botão, com o mesmo ícone e a mesma regra de cargo. */}
            <Button asChild variant="outline" className="gap-2">
              <a href="/itens/historico">
                <ScrollText className="size-4" />
                Histórico
              </a>
            </Button>
            {escreve && filiaisEscrita.length > 0 && (
              <Button asChild variant="outline" className="gap-2">
                <a href="/itens/conferencia">
                  <ClipboardCheck className="size-4" />
                  Conferir estoque
                </a>
              </Button>
            )}
            {escreve && filiaisEscrita.length >= 2 && (
              <TransferirItemDialog itens={CATALOGO} filiais={filiaisEscrita} />
            )}
            {escreve && (
              <LancarItemDialog
                itens={CATALOGO}
                filiais={filiaisEscrita}
                ultimo={null}
                podeCriarItem
              />
            )}
          </>
        }
      />

      <ItensFiltros
        filiais={FILIAIS_PREVIA}
        filiaisSelecionadas={filialIds.map(String)}
      />

      {cenario === 'vazio-catalogo' ? (
        <EstadoVazio
          titulo="Nenhum item no catálogo"
          descricao="Cadastre o catálogo em Administração → Itens para começar a lançar quantidades."
          acao={{ href: '/admin/itens', rotulo: 'Ir para Administração → Itens' }}
        />
      ) : cenario === 'vazio-filtro' ? (
        <EstadoVazio
          titulo="Nenhum item com esses filtros"
          descricao="Ajuste a busca, o grupo ou a filial para ver os saldos."
          acao={{ href: '/itens', rotulo: 'Limpar filtros' }}
        />
      ) : cenario === 'vazio-cargo' ? (
        <EstadoVazio
          titulo="Nenhum saldo nas suas filiais"
          descricao="Esta lista abre recortada nas filiais em que você opera — as outras podem ter saldo."
          acao={{ href: '/itens?filial=todas', rotulo: 'Ver todas as filiais' }}
        />
      ) : (
        <>
          {VARIANTES[variante].resumo && (
            <ResumoDeItens
              resumo={resumoDaLista(linhas, MINIMOS)}
              resumoDaPagina={resumoDaLista(pagina.rows, MINIMOS)}
              cabecalhos={cabecalhos}
              escopo={escopo}
            />
          )}
          <Tabela {...props} />
          <AtivosPaginacao
            page={pagina.page}
            pageSize={pagina.pageSize}
            total={pagina.total}
            saltoPagina
            tamanhos={TAMANHOS_PAGINA}
            rotuloTamanho="Itens por página"
          />
        </>
      )}
    </Pagina>
  )
}

// ---------------------------------------------------------------------------
// 6 · O documento
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
// 7 · A foto
// ---------------------------------------------------------------------------

/**
 * Playwright com Chromium; se o navegador não estiver baixado, tenta o Chrome do
 * sistema antes de desistir. Desistir NÃO é erro fatal: a prévia em HTML já
 * existe, e a ordem de serviço manda seguir registrando a limitação.
 */
async function abrirNavegador() {
  const { chromium } = await import('playwright')
  try {
    return await chromium.launch()
  } catch (erro) {
    console.warn(
      `⚠ Chromium do Playwright indisponível (${(erro as Error).message}); tentando o Chrome do sistema…`,
    )
    return await chromium.launch({ channel: 'chrome' })
  }
}

// ---------------------------------------------------------------------------
// 8 · Main
// ---------------------------------------------------------------------------

async function main() {
  const variantes = lista(argumento('variantes', 'atual'))
  for (const v of variantes) {
    if (!(v in VARIANTES)) {
      throw new Error(
        `variante "${v}" não existe. Disponíveis: ${Object.keys(VARIANTES).join(', ')}`,
      )
    }
  }
  const saida = argumento('saida', 'docs/f43-evidencias/previa')
  const tamanhos = parseLarguras(argumento('larguras', '1440x900,390x844'))
  const temas = lista(argumento('temas', 'claro,escuro')) as ('claro' | 'escuro')[]
  const cenarios = lista(argumento('cenarios', 'padrao')) as Cenario[]
  const recortes = lista(argumento('recortes', 'sem'))
  for (const r of recortes) {
    if (!(r in RECORTES)) {
      throw new Error(
        `recorte "${r}" não existe. Disponíveis: ${Object.keys(RECORTES).join(', ')}`,
      )
    }
  }

  const dir = resolve(RAIZ, saida)
  mkdirSync(dir, { recursive: true })

  console.log('… compilando o CSS do app a partir de src/app/globals.css')
  const css = await compilarCss()
  console.log(`  ${(css.length / 1024).toFixed(0)} kB de CSS`)

  const paginas: { arquivo: string; titulo: string }[] = []
  for (const variante of variantes) {
    for (const cenario of cenarios) {
      for (const recorte of recortes) {
        for (const tema of temas) {
          // A querystring do `Ambiente` acompanha o recorte: `ItensFiltros` lê
          // `useSearchParams` para montar os links de "Limpar" e do seletor de
          // filial — sem isto a barra de filtros da foto contaria outra história
          // que a tabela ao lado dela.
          const filialIds = RECORTES[recorte].filialIds
          const busca = filialIds.length > 0 ? `filial=${filialIds.join(',')}` : ''
          const corpo = renderToStaticMarkup(
            <Ambiente busca={busca}>
              <CascoDublê>
                <Miolo
                  variante={variante as keyof typeof VARIANTES}
                  cenario={cenario}
                  recorte={recorte}
                />
              </CascoDublê>
            </Ambiente>,
          )
          const nome = `itens__${variante}__${cenario}__${recorte}__${tema}`
          const titulo =
            `Itens · ${VARIANTES[variante as keyof typeof VARIANTES].rotulo}` +
            ` · ${cenario} · ${RECORTES[recorte].rotulo} · ${tema}`
          writeFileSync(join(dir, `${nome}.html`), documento({ css, corpo, tema, titulo }))
          paginas.push({ arquivo: `${nome}.html`, titulo })
          console.log(`  ${nome}.html`)
        }
      }
    }
  }

  if (temFlag('so-html')) {
    console.log(`\n✔ ${paginas.length} páginas em ${saida} (sem foto: --so-html)`)
    return
  }

  const navegador = await abrirNavegador()
  let fotos = 0
  try {
    for (const { arquivo } of paginas) {
      for (const tamanho of tamanhos) {
        const contexto = await navegador.newContext({
          viewport: { width: tamanho.width, height: tamanho.height },
          locale: 'pt-BR',
          deviceScaleFactor: 1,
        })
        const pagina = await contexto.newPage()
        await pagina.goto(pathToFileURL(join(dir, arquivo)).href, {
          waitUntil: 'load',
        })
        const png = `${arquivo.replace(/\.html$/, '')}__${tamanho.nome}.png`
        await pagina.screenshot({ path: join(dir, png), fullPage: true })
        fotos += 1
        console.log(`  ${png}`)
        const estoura = await pagina.evaluate(
          () =>
            document.documentElement.scrollWidth > document.documentElement.clientWidth,
        )
        if (estoura) console.warn(`  ⚠ ${png} rola na horizontal`)
        await contexto.close()
      }
    }
  } finally {
    await navegador.close()
  }
  console.log(`\n✔ ${paginas.length} páginas e ${fotos} imagens em ${saida}`)
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
