#!/usr/bin/env -S npx tsx
// A PRÉVIA ESTÁTICA DA FICHA DO ATIVO (`/ativos/[id]`) — fotografar o COMPONENTE
// REAL sem banco (F44). MESMO MOLDE de `previa-itens.tsx` (F43): leia o cabeçalho
// daquele arquivo para o "por quê" completo — aqui só o que muda.
//
// ============================================================================
// O QUE É REAL NA FOTO, E O QUE É DUBLÊ
// ============================================================================
// REAL (importado de `src/`, exatamente o que vai ao ar): `Pagina`,
// `CabecalhoDaPagina`, `SecaoDaPagina`, `VoltarParaAtivos`, `StatusBadge`,
// `CopiarPatrimonio`, `AnotarDialog`, `EditarAtivoDialog`, `AcoesExcecaoFicha`,
// `ItensQueForamJunto`, `PendenciasItemFicha`, `TermosDaFicha`, `LinhaDoTempo` e
// todo o kit `components/ui/`. O CSS é o do app.
// DUBLÊ: o cabeçalho superior e a barra lateral do app (mesmas medidas de
// `(app)/layout.tsx`), com "Ativos" marcado no menu.
// NÃO EXISTE na foto: a fonte Geist (`next/font` só roda dentro do Next) — cai no
// fallback `system-ui` do próprio `globals.css`.
//
// ============================================================================
// USO
// ============================================================================
// ⚠ O `--tsconfig scripts/design/tsconfig.previa.json` NÃO é opcional — troca o
// pacote `server-only` por um módulo vazio (`vazio-servidor.ts`). Sem ele, o
// import de `@/lib/auth/acesso` (server-only) lança na hora do import.
//
//   npx tsx --tsconfig scripts/design/tsconfig.previa.json \
//     scripts/design/previa-ficha.tsx --saida docs/f44-evidencias/antes
//   … --cenarios padrao,sem-pendencia,consulta --so-html
//
//   --cenarios    lista separada por vírgula (padrão: `padrao`)
//                 `padrao`        — escreve, com pendência de item aberta
//                 `sem-pendencia` — pendências de item e "itens que foram junto"
//                                   vazios (os dois cartões somem)
//                 `consulta`      — sem escrita (card "você só lê nesta filial")
//   --saida       pasta de destino (padrão: `docs/f44-evidencias/previa`)
//   --larguras    padrão `1440x900,390x844`
//   --temas       padrão `claro,escuro`
//   --so-html     não fotografa; só grava o HTML
//
// A pasta de saída é sempre limpa dos arquivos que esta passada regrava.
//
// ⚠ LIMITAÇÃO REGISTRADA (mesma da F43, ver `docs/DECISOES.md`): este
// repositório não tem `.env.ensaio`, e o `.env.local` aponta para produção —
// `scripts/design/capturar.mjs` se recusaria a fotografar a tela de verdade. Daí
// o COMPONENTE REAL alimentado por dados 100% FICTÍCIOS, em vez da tela ao vivo.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import Link from 'next/link'
import { Copy, Eye, PackageX, Plus, TriangleAlert } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  PathParamsContext,
  PathnameContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime'

import { CabecalhoDaPagina, Pagina, SecaoDaPagina } from '@/components/layout/pagina'
import { ProgressoNavegacaoProvider } from '@/components/layout/progresso-navegacao'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ativos/status-badge'
import { EditarAtivoDialog } from '@/components/ativos/editar-ativo-dialog'
import { AcoesExcecaoFicha } from '@/components/ativos/acoes-excecao-ficha'
import { VoltarParaAtivos } from '@/components/ativos/voltar-para-ativos'
import { CopiarPatrimonio } from '@/components/ativos/copiar-patrimonio'
import { AnotarDialog } from '@/components/ativos/anotar-dialog'
import { LinhaDoTempo } from '@/components/ativos/linha-do-tempo'
import { TermosDaFicha } from '@/components/ativos/termos-da-ficha'
import { PendenciasItemFicha } from '@/components/ativos/pendencias-item-ficha'
import { ItensQueForamJunto } from '@/components/ativos/itens-que-foram-junto'
import {
  MSG_SOMENTE_LEITURA,
  msgSemEscritaNaFilial,
} from '@/lib/auth/acesso'
import { podeEscreverNaFilial } from '@/components/layout/permissoes'
import { eAdmin } from '@/lib/auth/papeis'
import { rotuloCategoria, rotuloTermo } from '@/lib/dominio'
import { formatDate, ouTraco } from '@/lib/format'
import type { TermoTipo } from '@/lib/termos/tipos'
import type { VinculoAtivo } from '@/lib/queries/ativos'
import type { MovimentacaoTimeline } from '@/lib/queries/movimentacoes'

import {
  ATIVO_ID_PREVIA,
  ativoDaPrevia,
  anotacoesDaPrevia,
  itensJuntoDaPrevia,
  motivosDaPrevia,
  movimentacoesDaPrevia,
  operadorDaPrevia,
  pendenciasItemDaPrevia,
  rotulosTipoDaPrevia,
  termosDaPrevia,
  type CenarioFicha,
} from './previa-ficha-dados'

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
//
// Ver a explicação completa em `previa-itens.tsx` (§2) — mesma técnica, mesmo
// `@source` extra para o Tailwind v4 varrer `scripts/design`.
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
// `AnotarDialog`, `EditarAtivoDialog`, `AcoesExcecaoFicha`, `TermosDaFicha` e
// `LinhaDoTempo` (por dentro dela, `EstornarDialog`) são Client Components que
// chamam `useRouter`. `VoltarParaAtivos` também. Fora do Next esses hooks leem
// contextos que ninguém preencheu — mesma técnica de `previa-itens.tsx` §3. O
// roteador é INERTE de propósito: clique nenhum navega.

const ROTEADOR = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
} as never

function Ambiente({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterContext.Provider value={ROTEADOR}>
      <PathnameContext.Provider value={`/ativos/${ATIVO_ID_PREVIA}`}>
        <SearchParamsContext.Provider value={new URLSearchParams() as never}>
          <PathParamsContext.Provider value={{ id: ATIVO_ID_PREVIA }}>
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
                  rotulo === 'Ativos'
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
// 5 · O miolo — a MESMA composição de `src/app/(app)/ativos/[id]/page.tsx`
// ---------------------------------------------------------------------------

// Cópia literal do helper local `Dado` de `page.tsx` — não é exportado de lá,
// então a prévia precisa da própria cópia para reproduzir o grid "Dados do
// ativo" com o COMPONENTE REAL por baixo (`dt`/`dd`), não uma reimplementação.
function Dado({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function Miolo({ cenario }: { cenario: CenarioFicha }) {
  const ativo = ativoDaPrevia()
  const movimentacoes = movimentacoesDaPrevia()
  const anotacoes = anotacoesDaPrevia()
  const motivos = motivosDaPrevia()
  const termos = termosDaPrevia()
  const pendenciasItem = pendenciasItemDaPrevia(cenario)
  const operador = operadorDaPrevia(cenario)
  // F14/MN4 — vínculo de sucessão (devolução ao fornecedor). Esta prévia não
  // modela um ativo substituído: é o caso comum (a maioria dos ativos não tem
  // par). Os DOIS blocos condicionais que dependem disto — o card de vínculo,
  // logo abaixo do cabeçalho, e a seção "Histórico do ativo substituído", no
  // fim — continuam copiados verbatim; simplesmente não renderizam, do mesmo
  // jeito que não renderizam na ficha real de um ativo sem vínculo.
  const substitutoDeste: VinculoAtivo | null = null
  const ativoAntigo: VinculoAtivo | null = null
  const timelineAntigo: MovimentacaoTimeline[] = []
  const itensJunto = itensJuntoDaPrevia(cenario)
  const rotulosTipo = rotulosTipoDaPrevia()

  // F21 — esta ficha é de UM ativo, que mora em UMA filial: dá para responder
  // exatamente se quem abriu pode agir sobre ele.
  const podeEscreverNesta = podeEscreverNaFilial(operador, ativo.filial_id)
  const motivoSemEscrita = podeEscreverNesta
    ? null
    : operador?.papel === 'consulta'
      ? MSG_SOMENTE_LEITURA
      : msgSemEscritaNaFilial(ativo.filial_nome)

  // Movimentações elegíveis a termo (mais recentes; a linha do tempo vem desc):
  // responsabilidade (saída/empréstimo) e devolução — para geração retroativa.
  const respMov = movimentacoes.find(
    (m) => m.tipo === 'saida' || m.tipo === 'emprestimo',
  )
  const devolMov = movimentacoes.find((m) => m.tipo === 'devolucao')
  const devolTipo: TermoTipo | null = devolMov
    ? devolMov.motivo === 'desligamento'
      ? 'devolucao_desligamento'
      : 'devolucao_equipamento'
    : null

  const specs = [ativo.memoria, ativo.armazenamento, ativo.processador]
    .filter(Boolean)
    .join(' · ')
  // ATV-07b — pivô: marca+modelo vira busca por texto em /ativos.
  const marcaModelo = [ativo.marca, ativo.modelo].filter(Boolean).join(' ')

  return (
    <Pagina>
      {/* `LembrarAtivoRecente` NÃO entra: só escreve no sessionStorage, não
          renderiza nada (ordem F44). */}
      <VoltarParaAtivos />

      {/* Cabecalho — F40: o `<h1>` sai do `CabecalhoDaPagina`, e o
          `tabular-nums` do patrimônio sobrevive porque a prop `titulo` aceita
          `ReactNode`. O botão de copiar e o crachá de status vão em `aoLado`. */}
      <CabecalhoDaPagina
        ajuda="ficha-do-ativo"
        ajudaRotulo="Ajuda sobre a ficha do ativo"
        titulo={
          <span className="tabular-nums">
            {ativo.patrimonio ?? (
              <span className="text-muted-foreground italic">Sem patrimônio</span>
            )}
          </span>
        }
        aoLado={
          <>
            {ativo.patrimonio && <CopiarPatrimonio valor={ativo.patrimonio} />}
            <StatusBadge status={ativo.status} />
          </>
        }
        descricao={
          <span className="flex flex-wrap items-center gap-x-1">
            {rotuloCategoria(ativo.categoria)}
            {ativo.service_tag && (
              <>
                <span>·</span>
                <span className="tabular-nums">
                  Service Tag {ativo.service_tag}
                </span>
                <CopiarPatrimonio
                  valor={ativo.service_tag}
                  rotulo="Service tag"
                />
              </>
            )}
            {/* ATV-07c — quem está com o ativo, direto no cabeçalho. */}
            {ativo.colaborador_atual && (
              <>
                <span>·</span>
                <span>
                  com {ativo.colaborador_atual}
                  {ativo.setor_atual && ` (${ativo.setor_atual})`}
                </span>
              </>
            )}
          </span>
        }
        acoes={
          podeEscreverNesta ? (
            <>
              <Button asChild size="sm" className="h-10 gap-2 sm:h-8">
                <Link href={`/movimentacoes/nova?ativo=${ativo.id}`}>
                  <Plus className="size-4" />
                  Nova movimentação
                </Link>
              </Button>
              {/* F14/MN3 — atalho para o fluxo dedicado (só em manutenção) */}
              {ativo.status === 'em_manutencao' && (
                <Button asChild size="sm" variant="outline" className="h-10 gap-2 sm:h-8">
                  <Link href={`/movimentacoes/devolucao-fornecedor?ativo=${ativo.id}`}>
                    <PackageX className="size-4" />
                    Devolver ao fornecedor
                  </Link>
                </Button>
              )}
              {/* A6 (F10) — comprar outra unidade do mesmo modelo. */}
              <Button asChild size="sm" variant="outline" className="h-10 gap-2 sm:h-8">
                <Link href={`/ativos/novo?duplicar=${ativo.id}`}>
                  <Copy className="size-4" />
                  Comprar outro igual
                </Link>
              </Button>
              <AnotarDialog ativoId={ativo.id} />
              <EditarAtivoDialog ativo={ativo} />
              {/* F19 — as ações de EXCEÇÃO saem da barra para o menu "⋯". */}
              <AcoesExcecaoFicha
                ativoId={ativo.id}
                patrimonio={ativo.patrimonio}
                serviceTag={ativo.service_tag}
              />
            </>
          ) : (
            // F40 — a moldura vem do `Card`; `ring-0 border` mantém o traço no
            // MESMO tom de hoje.
            <Card className="flex max-w-sm flex-row items-start gap-2 border bg-muted/40 p-3 text-xs text-muted-foreground ring-0">
              <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{motivoSemEscrita}</span>
            </Card>
          )
        }
      />

      {/* F14/MN4 — vínculo de sucessão (nos dois sentidos). Não renderiza nesta
          prévia (ativoAntigo/substitutoDeste ficam null — ver comentário acima
          do `Miolo`). */}
      {(ativoAntigo || substitutoDeste) && (
        <Card className="flex flex-row flex-wrap items-center gap-x-6 gap-y-1.5 border bg-muted/30 p-3 text-sm ring-0">
          {ativoAntigo && (
            <span className="inline-flex items-center gap-1.5">
              <PackageX className="size-4 text-muted-foreground" />
              Substitui{' '}
              <Link
                href={`/ativos/${ativoAntigo.id}`}
                className="font-medium tabular-nums underline-offset-2 hover:underline"
              >
                {ativoAntigo.patrimonio ?? 'sem patrimônio'}
              </Link>{' '}
              <span className="text-muted-foreground">(devolvido ao fornecedor)</span>
            </span>
          )}
          {substitutoDeste && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground">Substituído por</span>{' '}
              <Link
                href={`/ativos/${substitutoDeste.id}`}
                className="font-medium tabular-nums underline-offset-2 hover:underline"
              >
                {substitutoDeste.patrimonio ?? 'sem patrimônio'}
              </Link>
            </span>
          )}
        </Card>
      )}

      {/* Pendencia em destaque. F40 — a moldura à mão virou `Card`. A TINTA
          ÂMBAR NÃO MUDA: continua `amber-300/amber-50/amber-900` no claro e o
          par `dark:` no escuro. */}
      {ativo.pendencia && (
        <Card className="flex flex-row items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 ring-0 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Pendência:</span> {ativo.pendencia}
          </span>
        </Card>
      )}

      {/* F18 — pendências de item faltante (abertas em destaque + resolvidas
          como auditoria). F28/PND-05 — reabrir uma RESOLVIDA é do nível
          administrador, não de quem apenas escreve nesta filial. F38 — o que
          foi junto com este equipamento (join por movimentacao_id). */}
      <ItensQueForamJunto itens={itensJunto} />

      <PendenciasItemFicha
        patrimonio={ativo.patrimonio}
        pendencias={pendenciasItem}
        rotulosTipo={rotulosTipo}
        podeResolver={podeEscreverNesta}
        podeReabrir={eAdmin(operador?.papel)}
      />

      {/* Grid de dados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do ativo</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            <Dado label="Categoria">{rotuloCategoria(ativo.categoria)}</Dado>
            <Dado label="Marca / Modelo">
              {/* ATV-07b — pivô: leva à lista de ativos filtrada por esta
                  marca+modelo. `filial=todas` é a sentinela obrigatória. */}
              {marcaModelo ? (
                <Link
                  href={`/ativos?q=${encodeURIComponent(marcaModelo)}&filial=todas`}
                  className="underline-offset-2 hover:underline"
                  title="Buscar outros ativos desta marca e modelo"
                >
                  {marcaModelo}
                </Link>
              ) : (
                ouTraco(marcaModelo)
              )}
            </Dado>
            <Dado label="Specs">{ouTraco(specs)}</Dado>
            <Dado label="Hostname">{ouTraco(ativo.hostname)}</Dado>
            {/* F25 — só o CELULAR (a categoria é imutável na vida do ativo). */}
            {ativo.categoria === 'celular' && (
              <>
                <Dado label="Nº do telefone">{ouTraco(ativo.telefone)}</Dado>
                <Dado label="IMEI">{ouTraco(ativo.imei)}</Dado>
                <Dado label="Pulsus">{ouTraco(ativo.pulsus)}</Dado>
              </>
            )}
            <Dado label="Fornecedor">{ouTraco(ativo.fornecedor)}</Dado>
            <Dado label="Filial">{ativo.filial_nome}</Dado>
            <Dado label="Colaborador">
              {/* ATV-07b — mesmo pivô, agora por nome do colaborador. */}
              {ativo.colaborador_atual ? (
                <Link
                  href={`/ativos?q=${encodeURIComponent(ativo.colaborador_atual)}&filial=todas`}
                  className="underline-offset-2 hover:underline"
                  title="Buscar outros ativos deste colaborador"
                >
                  {ativo.colaborador_atual}
                </Link>
              ) : (
                ouTraco(ativo.colaborador_atual)
              )}
            </Dado>
            <Dado label="Setor">{ouTraco(ativo.setor_atual)}</Dado>
            <Dado label="Termo">
              {rotuloTermo(ativo.termo_assinado)}
              {ativo.termo_data && (
                <span className="text-muted-foreground">
                  {' '}
                  ({formatDate(ativo.termo_data)})
                </span>
              )}
            </Dado>
            <Dado label="Patrimônio original">
              {ouTraco(ativo.patrimonio_original)}
            </Dado>
            <Dado label="Origem">{ouTraco(ativo.origem)}</Dado>
          </dl>
          {ativo.observacoes && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {ativo.observacoes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Termos gerados + geração retroativa (F5A) + confirmar assinatura (B6) */}
      <TermosDaFicha
        ativoId={ativo.id}
        patrimonio={ativo.patrimonio}
        categoria={ativo.categoria}
        termoAssinado={ativo.termo_assinado}
        termoData={ativo.termo_data}
        termos={termos}
        respMovId={respMov?.id ?? null}
        devolMovId={devolMov?.id ?? null}
        devolTipo={devolTipo}
        podeEscrever={podeEscreverNesta}
      />

      {/* Linha do tempo — F40: título de seção padrão do produto (16px). */}
      <SecaoDaPagina titulo="Linha do tempo">
        {/* `somenteLeitura` já existia para o histórico do ativo substituído
            (F14/MN4); a F21 passa a usá-lo também quando o CARGO não escreve
            nesta filial. */}
        <LinhaDoTempo
          movimentacoes={movimentacoes}
          anotacoes={anotacoes}
          motivos={motivos}
          rotulosTipo={rotulosTipo}
          somenteLeitura={!podeEscreverNesta}
        />
      </SecaoDaPagina>

      {/* F14/MN4 — histórico do ativo SUBSTITUÍDO (por vínculo, sem copiar
          movs). Não renderiza nesta prévia (ver comentário acima). */}
      {ativo.substitui_ativo_id && ativoAntigo && (
        <SecaoDaPagina
          titulo={
            <>
              Histórico do ativo substituído —{' '}
              <span className="tabular-nums">
                {ativoAntigo.patrimonio ?? 'sem patrimônio'}
              </span>
            </>
          }
          descricao={
            <>
              As movimentações abaixo pertencem ao ativo devolvido ao fornecedor (
              <Link
                href={`/ativos/${ativoAntigo.id}`}
                className="underline-offset-2 hover:underline"
              >
                ver ficha
              </Link>
              ) — mostradas aqui só para consulta.
            </>
          }
        >
          <LinhaDoTempo
            movimentacoes={timelineAntigo}
            motivos={motivos}
            rotulosTipo={rotulosTipo}
            somenteLeitura
          />
        </SecaoDaPagina>
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
 * existe.
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

const CENARIOS_VALIDOS: readonly CenarioFicha[] = ['padrao', 'sem-pendencia', 'consulta']

async function main() {
  const cenarios = lista(argumento('cenarios', 'padrao')) as CenarioFicha[]
  for (const c of cenarios) {
    if (!CENARIOS_VALIDOS.includes(c)) {
      throw new Error(
        `cenário "${c}" não existe. Disponíveis: ${CENARIOS_VALIDOS.join(', ')}`,
      )
    }
  }
  const saida = argumento('saida', 'docs/f44-evidencias/previa')
  const tamanhos = parseLarguras(argumento('larguras', '1440x900,390x844'))
  const temas = lista(argumento('temas', 'claro,escuro')) as ('claro' | 'escuro')[]

  const dir = resolve(RAIZ, saida)
  mkdirSync(dir, { recursive: true })

  console.log('… compilando o CSS do app a partir de src/app/globals.css')
  const css = await compilarCss()
  console.log(`  ${(css.length / 1024).toFixed(0)} kB de CSS`)

  const paginas: { arquivo: string; titulo: string }[] = []
  for (const cenario of cenarios) {
    for (const tema of temas) {
      const corpo = renderToStaticMarkup(
        <Ambiente>
          <CascoDublê>
            <Miolo cenario={cenario} />
          </CascoDublê>
        </Ambiente>,
      )
      const nome = `ficha__${cenario}__${tema}`
      const titulo = `Ficha do ativo · ${cenario} · ${tema}`
      writeFileSync(join(dir, `${nome}.html`), documento({ css, corpo, tema, titulo }))
      paginas.push({ arquivo: `${nome}.html`, titulo })
      console.log(`  ${nome}.html`)
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
