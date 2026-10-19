#!/usr/bin/env -S npx tsx
// A PRÉVIA ESTÁTICA DA v1.71.2 — a tabela de Administração › Colaboradores com o selo "Sem uso" e o filtro "Uso".
// Mesmo molde de `previa-v1711.tsx` e `previa-f61.tsx`: o componente REAL (`ColaboradoresTabela`), as fixtures 100%
// fictícias dos testes (`colaboradores-tabela-fixtures.ts`), `renderToStaticMarkup`, o CSS do app compilado pelo motor do
// build e o Playwright em `file://`. Nenhum banco, nenhuma sessão, nenhum `.env`.
//
// DUBLÊS: `server-only` (o do `tsconfig.previa.json` — SEM o dublê de diálogo da F61, que abriria todo "Editar" na
// foto; com o diálogo real fechado, o SSR só desenha o botão), o roteador inerte (os filhos da
// linha chamam `useRouter`) e a fonte (`--font-geist-sans` = `system-ui`, como na prévia da v1.71.1).
// O FILTRO: a foto é estática (sem hidratação), então ela mostra o controle "Uso" na posição de partida; a escolha de
// "Sem uso"/"Em uso" é provada por interação em `colaboradores-tabela.dom.test.tsx`.
//
// USO
//   npx tsx --tsconfig scripts/design/tsconfig.previa.json scripts/design/previa-v1712.tsx \
//     --saida docs/v1.71.2-evidencias/previa

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
import { ColaboradoresTabela } from '@/components/admin/colaboradores-tabela'
import { COLABORADORES_FICTICIOS, FILIAIS_FICTICIAS } from '@/components/admin/colaboradores-tabela-fixtures'
import type { ColaboradorAdmin } from '@/lib/queries/colaboradores'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const i = process.argv.indexOf('--saida')
const SAIDA = resolve(RAIZ, i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'docs/v1.71.2-evidencias/previa')

const ROTEADOR = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
} as never

function tela(colaboradores: ColaboradorAdmin[]): string {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={ROTEADOR}>
      <PathnameContext.Provider value="/admin/colaboradores">
        <SearchParamsContext.Provider value={new URLSearchParams('') as never}>
          <PathParamsContext.Provider value={{}}>
            <TooltipProvider delayDuration={300}>
              <main className="p-4 md:p-6">
                <ColaboradoresTabela colaboradores={colaboradores} filiais={FILIAIS_FICTICIAS} />
              </main>
            </TooltipProvider>
          </PathParamsContext.Provider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  )
}

async function compilarCss(): Promise<string> {
  const entrada = join(RAIZ, 'src', 'app', 'globals.css')
  const fonte = `${readFileSync(entrada, 'utf8')}\n@source "../../scripts/design";\n`
  return (await postcss([tailwind()]).process(fonte, { from: entrada })).css
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
const FLAGS = ['--disable-lcd-text', '--force-color-profile=srgb', '--disable-gpu', '--font-render-hinting=none']

async function main() {
  mkdirSync(SAIDA, { recursive: true })
  const css = await compilarCss()
  const cenarios: [string, ColaboradorAdmin[]][] = [
    ['selo-sem-uso', COLABORADORES_FICTICIOS],
    ['uso-indisponivel', COLABORADORES_FICTICIOS.map((c) => ({ ...c, uso: null }))],
  ]
  const { chromium } = await import('playwright')
  const navegador = await chromium.launch({ args: FLAGS }).catch(() => chromium.launch({ channel: 'chrome', args: FLAGS }))
  const medidas: Record<string, { scrollWidth: number; clientWidth: number; rolaHorizontal: boolean }> = {}
  try {
    for (const [cenario, lista] of cenarios) {
      const corpo = tela(lista)
      for (const tema of ['claro', 'escuro'] as const) {
        const arquivo = `${cenario}__${tema}.html`
        writeFileSync(join(SAIDA, arquivo), documento(css, corpo, tema, `v1.71.2 · ${cenario} · ${tema}`))
        for (const [nome, largura, altura] of [['1366', 1366, 768], ['390', 390, 844]] as const) {
          const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, locale: 'pt-BR', deviceScaleFactor: 1 })
          const pagina = await contexto.newPage()
          await pagina.goto(pathToFileURL(join(SAIDA, arquivo)).href, { waitUntil: 'load' })
          await pagina.addStyleTag({ content: CSS_SEM_ANIMACAO })
          await pagina.evaluate(() => document.fonts.ready)
          const png = `${cenario}__${tema}__${nome}.png`
          await pagina.screenshot({ path: join(SAIDA, png), fullPage: true })
          const info = await pagina.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }))
          medidas[png] = { ...info, rolaHorizontal: info.scrollWidth > info.clientWidth }
          console.log(`  ${png}${info.scrollWidth > info.clientWidth ? '  ⚠ rola na horizontal' : ''}`)
          await contexto.close()
        }
      }
    }
  } finally {
    await navegador.close()
  }
  writeFileSync(join(SAIDA, 'medidas.json'), `${JSON.stringify(medidas, null, 2)}\n`)
  const rolam = Object.values(medidas).filter((m) => m.rolaHorizontal).length
  console.log(`\n${Object.keys(medidas).length} fotos · ${rolam} rolam na horizontal`)
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
