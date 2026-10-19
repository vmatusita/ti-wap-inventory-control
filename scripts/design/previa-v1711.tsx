#!/usr/bin/env -S npx tsx
// A PRÉVIA ESTÁTICA DA v1.71.1 — o card "Reservados" do relatório, ANTES e DEPOIS de
// separar a lista por categoria. Mesmo molde de `previa-f61.tsx` (leia o cabeçalho de lá
// para o "por quê" completo): componentes REAIS de `src/`, `renderToStaticMarkup`, o CSS do
// app compilado pelo mesmo motor do build e o Playwright em `file://`. Nenhum banco, nenhuma
// sessão, nenhum `.env`: o dado é 100% fictício (regra 2 do CLAUDE.md) — o patrimônio usa o
// prefixo `FIC`, fora do formato `WAP` que `varrer-evidencias.mts` procura, e um único
// `WAP0001234`, a sentinela fictícia da casa.
//
// O QUE É REAL: `CardRelatorio`, `ListaReservados` e `ListaModeloCategoria` (o card vizinho,
// "Disponíveis por modelo", na mesma grade de duas colunas do grupo "Equipamentos
// principais" — é ao lado dele que a ordem das categorias tem de ser a mesma).
// O QUE É DUBLÊ: o pacote `server-only` (`vazio-servidor.ts`, herdado da F43) e a fonte: `next/font` só
// existe dentro do Next, e sem ela `var(--font-geist-sans)` invalida a pilha inteira e o texto cai em serifa;
// a prévia define a variável como `system-ui`, a fonte do sistema que o CLAUDE.md pede.
// O SUBTÍTULO do card mora no corpo do relatório, não no componente. A prévia o monta como o
// corpo monta: `--fase antes` usa o texto fixo de antes da v1.71.1; `--fase depois` usa a
// MESMA função que o corpo chama (`rotuloReservados`, importada só nessa fase — na rodada
// "antes" o módulo ainda não existe).
//
// USO
//   npx tsx --tsconfig scripts/design/tsconfig.previa.json scripts/design/previa-v1711.tsx \
//     --fase antes|depois --saida docs/v1.71.1-evidencias/<fase>
//
// Grava, por cenário × tema: `<cenario>__<tema>.html`, e as fotos `…__1366.png`, `…__390.png` e
// `…__impressao.png` (`emulateMedia({ media: 'print' })`, largura de uma folha A4), mais
// `medidas.json` com `scrollWidth`/`clientWidth` de cada foto — a prova de que 390 não rola
// na horizontal — e, na fase "depois", `lista-longa__impressao.pdf` (a paginação real do
// Chromium, para conferir que o cabeçalho do grupo não fica sozinho no pé da folha).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

import { TooltipProvider } from '@/components/ui/tooltip'
import { CardRelatorio } from '@/components/relatorios/card-relatorio'
import { ListaReservados } from '@/components/relatorios/lista-reservados'
import { ListaModeloCategoria } from '@/components/relatorios/lista-modelo-categoria'
import type { ItemReservado, ModelosPorCategoria } from '@/lib/relatorios/tipos'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function arg(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}

const FASE = arg('fase', 'depois') as 'antes' | 'depois'
const SAIDA = resolve(RAIZ, arg('saida', `docs/v1.71.1-evidencias/${FASE}`))
if (FASE !== 'antes' && FASE !== 'depois') throw new Error('--fase antes|depois')

// ---------------------------------------------------------------------------
// O dado — fictício. `categoria` é o campo novo; o cenário "snapshot-antigo" o omite, como
// todo snapshot congelado antes da v1.71.1.
// ---------------------------------------------------------------------------
type Reservado = ItemReservado & { categoria?: 'notebook' | 'celular' | 'monitor' }
const r = (patrimonio: string, modelo: string, chamado: string | null, categoria?: Reservado['categoria']): Reservado =>
  categoria ? { patrimonio, modelo, chamado, categoria } : { patrimonio, modelo, chamado }

const VARIAS: Reservado[] = [
  r('FIC0000101', 'Dell Monitor Modelo A', '4101', 'monitor'),
  r('FIC0000102', 'Lenovo Notebook Modelo B', '4102', 'notebook'),
  r('FIC0000103', 'Samsung Celular Modelo C', null, 'celular'),
  r('FIC0000104', 'Lenovo Notebook Modelo B', '4104', 'notebook'),
  r('FIC0000105', 'Samsung Celular Modelo C', '4105', 'celular'),
  r('WAP0001234', 'Dell Notebook Modelo D', '4106', 'notebook'),
]
const UMA: Reservado[] = VARIAS.filter((i) => i.categoria === 'notebook')
const ANTIGO: Reservado[] = VARIAS.map(({ patrimonio, modelo, chamado }) => ({ patrimonio, modelo, chamado }))
const LONGA: Reservado[] = Array.from({ length: 46 }, (_, k) => {
  const n = String(200 + k).padStart(7, '0')
  const cat = k < 30 ? 'notebook' : k < 40 ? 'celular' : 'monitor'
  return r(`FIC${n}`, cat === 'notebook' ? 'Lenovo Notebook Modelo B' : cat === 'celular' ? 'Samsung Celular Modelo C' : 'Dell Monitor Modelo A', String(5000 + k), cat)
})

const DISPONIVEIS: ModelosPorCategoria[] = [
  { categoria: 'notebook', total: 5, modelos: [{ modelo: 'Lenovo Notebook Modelo B', total: 3 }, { modelo: 'Dell Notebook Modelo D', total: 2 }] },
  { categoria: 'celular', total: 4, modelos: [{ modelo: 'Samsung Celular Modelo C', total: 4 }] },
  { categoria: 'monitor', total: 2, modelos: [{ modelo: 'Dell Monitor Modelo A', total: 2 }] },
]

const PERIODO = { de: '2026-10-12', ate: '2026-10-19' }

async function subtitulo(n: number): Promise<string> {
  if (FASE === 'antes') return 'patrimônio · modelo · nº do chamado'
  const { rotuloReservados } = await import('@/lib/relatorios/reservados')
  return rotuloReservados(n)
}

async function grade(itens: Reservado[]): Promise<string> {
  const sub = await subtitulo(itens.length)
  return renderToStaticMarkup(
    <TooltipProvider>
      <main className="mx-auto p-4 md:p-6">
        <div className="rel-print-cols grid gap-4 md:grid-cols-2">
          <CardRelatorio
            titulo="Disponíveis por modelo"
            subtitulo="11 em estoque — a lista do e-mail"
            janela="foto"
            periodoJanela={PERIODO}
          >
            <ListaModeloCategoria grupos={DISPONIVEIS} />
          </CardRelatorio>
          <CardRelatorio
            titulo="Reservados"
            subtitulo={sub}
            janela="foto"
            periodoJanela={PERIODO}
            vazio={itens.length === 0}
          >
            <ListaReservados itens={itens} />
          </CardRelatorio>
        </div>
      </main>
    </TooltipProvider>,
  )
}

async function compilarCss(): Promise<string> {
  const entrada = join(RAIZ, 'src', 'app', 'globals.css')
  const fonte = `${readFileSync(entrada, 'utf8')}\n@source "../../scripts/design";\n`
  const saida = await postcss([tailwind()]).process(fonte, { from: entrada })
  return saida.css
}

function documento(css: string, corpo: string, tema: 'claro' | 'escuro', titulo: string): string {
  return `<!doctype html>
<html lang="pt-BR" class="${tema === 'escuro' ? 'dark ' : ''}h-full antialiased">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>${css}</style>
<style>:root{--font-geist-sans:system-ui;--font-geist-mono:ui-monospace}</style>
</head>
<body class="min-h-svh bg-background text-foreground">${corpo}</body>
</html>
`
}

const CSS_SEM_ANIMACAO = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
const FLAGS = [
  '--disable-lcd-text',
  '--force-color-profile=srgb',
  '--run-all-compositor-stages-before-draw',
  '--disable-checker-imaging',
  '--disable-gpu',
  '--font-render-hinting=none',
]

async function main() {
  mkdirSync(SAIDA, { recursive: true })
  const css = await compilarCss()
  const cenarios: [string, Reservado[]][] = [
    ['varias-categorias', VARIAS],
    ['uma-categoria', UMA],
    ['snapshot-antigo', ANTIGO],
  ]
  if (FASE === 'depois') cenarios.push(['lista-longa', LONGA])

  const { chromium } = await import('playwright')
  const navegador = await chromium.launch({ args: FLAGS }).catch(() => chromium.launch({ channel: 'chrome', args: FLAGS }))
  const medidas: Record<string, { scrollWidth: number; clientWidth: number; rolaHorizontal: boolean }> = {}
  try {
    for (const [cenario, itens] of cenarios) {
      const corpo = await grade(itens)
      for (const tema of ['claro', 'escuro'] as const) {
        const arquivo = `${cenario}__${tema}.html`
        writeFileSync(join(SAIDA, arquivo), documento(css, corpo, tema, `v1.71.1 · ${FASE} · ${cenario} · ${tema}`))
        const telas: [string, number, number, boolean][] = [
          ['1366', 1366, 768, false],
          ['390', 390, 844, false],
        ]
        // A impressão sai sempre clara (o `dark:` não casa no papel — globals.css), então uma foto
        // de impressão por cenário basta: a do tema claro.
        if (tema === 'claro') telas.push(['impressao', 794, 1123, true])
        for (const [nome, largura, altura, impressao] of telas) {
          const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, locale: 'pt-BR', deviceScaleFactor: 1 })
          const pagina = await contexto.newPage()
          await pagina.goto(pathToFileURL(join(SAIDA, arquivo)).href, { waitUntil: 'load' })
          await pagina.addStyleTag({ content: CSS_SEM_ANIMACAO })
          if (impressao) await pagina.emulateMedia({ media: 'print' })
          await pagina.evaluate(() => document.fonts.ready)
          const png = `${cenario}__${tema}__${nome}.png`
          await pagina.screenshot({ path: join(SAIDA, png), fullPage: true })
          const info = await pagina.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }))
          medidas[png] = { ...info, rolaHorizontal: info.scrollWidth > info.clientWidth }
          if (info.scrollWidth > info.clientWidth) console.warn(`  ⚠ ${png} rola na horizontal`)
          if (impressao && cenario === 'lista-longa') {
            await pagina.pdf({ path: join(SAIDA, `${cenario}__impressao.pdf`), format: 'A4', printBackground: true })
          }
          console.log(`  ${png}`)
          await contexto.close()
        }
      }
    }
  } finally {
    await navegador.close()
  }
  writeFileSync(join(SAIDA, 'medidas.json'), `${JSON.stringify(medidas, null, 2)}\n`)
  const rolam = Object.entries(medidas).filter(([, m]) => m.rolaHorizontal).map(([k]) => k)
  console.log(`\n${Object.keys(medidas).length} fotos · ${rolam.length} rolam na horizontal${rolam.length ? `: ${rolam.join(', ')}` : ''}`)
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
