#!/usr/bin/env node
// MEDIR A TABELA DE UMA PRÉVIA — a régua que a foto sozinha não dá (F43).
//
// POR QUE ELE EXISTE, e é uma história curta: a foto de 390px da tela de itens
// mostrava o nome do item e mais nada, e a leitura "óbvia" era que as colunas de
// número tinham sido escondidas por breakpoint. Não tinham. Este script mediu:
//
//     390px  wrap 356/740  →  colunas visíveis: Item, Em estoque, Em uso, Ações
//
// A tabela pedia **740px dentro de uma caixa de 356px**. As colunas existiam no
// HTML e estavam FORA da área visível, atrás de uma rolagem horizontal que
// ninguém descobre. A causa era o `whitespace-nowrap` do `TableCell` do kit
// somado a um nome de item comprido — e nenhuma quantidade de olhar a imagem
// teria dito isso.
//
// Ferramenta de DEV, para as prévias de `scripts/design/previa-itens.tsx`. Não
// roda em CI, não toca banco, não lê `.env`.
//
// Uso:
//   node scripts/design/medir-tabela.mjs docs/f43-evidencias/depois/itens__atual__padrao__claro.html
//   node scripts/design/medir-tabela.mjs <arquivo.html> [outro.html …]
//
// Para cada arquivo e cada largura, imprime:
//   · `wrap cliente/rolagem` — a caixa da tabela contra a largura que ela PEDE.
//     Divergiu, há coluna fora da tela.
//   · as colunas realmente visíveis, com a largura de cada uma;
//   · se a PÁGINA rola na horizontal (defeito diferente, e pior).

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const LARGURAS = [
  [1440, 900],
  [390, 844],
]

const arquivos = process.argv.slice(2)
if (arquivos.length === 0) {
  console.error('uso: node scripts/design/medir-tabela.mjs <arquivo.html> [...]')
  process.exit(1)
}

const { chromium } = await import('playwright')
const navegador = await chromium.launch()
try {
  for (const arquivo of arquivos) {
    for (const [width, height] of LARGURAS) {
      const contexto = await navegador.newContext({
        viewport: { width, height },
        locale: 'pt-BR',
      })
      const pagina = await contexto.newPage()
      await pagina.goto(pathToFileURL(resolve(arquivo)).href, { waitUntil: 'load' })
      const medida = await pagina.evaluate(() => {
        const tabela = document.querySelector('table')
        const caixa = tabela?.parentElement
        const ths = [...document.querySelectorAll('thead th')]
        return {
          cliente: caixa?.clientWidth ?? 0,
          rolagem: caixa?.scrollWidth ?? 0,
          colunas: ths
            // `offsetParent === null` é o teste de "não está na tela": pega o
            // `hidden` do Tailwind sem precisar saber qual breakpoint o pôs lá.
            .filter((th) => th.offsetParent !== null)
            .map((th) => ({
              rotulo: th.innerText.replace(/\n/g, ' | ').trim().slice(0, 28),
              largura: Math.round(th.getBoundingClientRect().width),
            })),
          paginaRola:
            document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }
      })
      const nome = arquivo.split(/[\\/]/).pop()
      const estoura = medida.rolagem > medida.cliente ? '  ⚠ COLUNA FORA DA TELA' : ''
      console.log(
        `${nome}  ${width}px  wrap ${medida.cliente}/${medida.rolagem}${estoura}` +
          (medida.paginaRola ? '  ⚠ A PÁGINA ROLA NA HORIZONTAL' : ''),
      )
      console.log(
        '    ' + medida.colunas.map((c) => `${c.rotulo}=${c.largura}`).join('   '),
      )
      await contexto.close()
    }
  }
} finally {
  await navegador.close()
}
