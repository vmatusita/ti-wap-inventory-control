#!/usr/bin/env node
// MEDIR O ESTADO EXPANDIDO NA ÁRVORE DE ACESSIBILIDADE — a prova que a foto não
// dá e que o teste de consistência não alcança (F44).
//
// POR QUE ELE EXISTE. O critério 10 da ordem da F44 exige `aria-expanded` correto
// nos blocos recolhíveis da ficha do ativo. Esses blocos são `<details>`/
// `<summary>` — e a escolha foi por CUSTO: `BotaoExpandir` é client, e os dois
// blocos são Server Components (ver `components/ativos/itens-que-foram-junto.tsx`).
//
// Com `<details>`, o estado expandido é NATIVO: ninguém escreve `aria-expanded`, o
// navegador é que o expõe. Só que "o navegador expõe" é exatamente o tipo de
// afirmação que não vale sem prova — então este script pergunta ao CHROMIUM, pela
// árvore de acessibilidade do CDP, o que um leitor de tela veria. Se um dia
// alguém trocar `<details>` por uma `<div>` com `onClick`, a coluna `expanded`
// vira `(ausente)` e a troca aparece.
//
// Ferramenta de DEV. Não roda em CI, não toca banco, não lê `.env`.
//
// Uso:
//   node scripts/design/medir-acessibilidade.mjs docs/f44-evidencias/depois/ficha__padrao__claro.html
//   node scripts/design/medir-acessibilidade.mjs <arquivo.html> [outro.html …]
//
// Imprime, por `<details>`: o papel na árvore de acessibilidade, o estado
// `expanded` que o navegador calculou, se alguém escreveu `aria-expanded` à mão
// (o esperado é "nenhum") e a altura do alvo de toque — a régua da casa é 40px.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const arquivos = process.argv.slice(2)
if (arquivos.length === 0) {
  console.error('uso: node scripts/design/medir-acessibilidade.mjs <arquivo.html> [...]')
  process.exit(1)
}

const { chromium } = await import('playwright')
const navegador = await chromium.launch()
try {
  for (const arquivo of arquivos) {
    const contexto = await navegador.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'pt-BR',
    })
    const pagina = await contexto.newPage()
    await pagina.goto(pathToFileURL(resolve(arquivo)).href, { waitUntil: 'load' })

    const cdp = await contexto.newCDPSession(pagina)
    await cdp.send('Accessibility.enable')
    const { nodes } = await cdp.send('Accessibility.getFullAXTree')

    // O que o DOM diz — para cruzar com o que a árvore de acessibilidade diz.
    const medidas = await pagina.evaluate(() =>
      [...document.querySelectorAll('details')].map((d) => {
        const s = d.querySelector('summary')
        // `<details>` SEM `<summary>` é justamente a não-conformidade que esta
        // ferramenta existe para acusar (o navegador desenha um triângulo genérico
        // e não expõe nome nenhum) — então ela vira LINHA no relatório, e não uma
        // exceção que derruba a varredura antes dos blocos seguintes.
        if (!s) {
          return { nome: '(sem <summary>)', aberto: d.open, escritoAMao: null, alturaPx: 0 }
        }
        return {
          nome: s.innerText.replace(/\s+/g, ' ').trim(),
          aberto: d.open,
          escritoAMao: s.getAttribute('aria-expanded'),
          alturaPx: Math.round(s.getBoundingClientRect().height),
        }
      }),
    )

    console.log(`\n### ${arquivo.split(/[\/]/).pop()}`)
    if (medidas.length === 0) {
      console.log('  (nenhum <details> nesta página)')
      await contexto.close()
      continue
    }
    console.log('| bloco | papel (árvore de acessibilidade) | expanded | aria-expanded à mão | alvo |')
    console.log('|---|---|---|---|---|')
    for (const m of medidas) {
      const no = nodes.find(
        (n) =>
          (n.name?.value ?? '').replace(/\s+/g, ' ').trim().startsWith(m.nome.slice(0, 20)) &&
          n.role?.value === 'DisclosureTriangle',
      )
      const exp = (no?.properties ?? []).find((p) => p.name === 'expanded')
      const alvoOk = m.alturaPx >= 40 ? '✅' : '❌'
      console.log(
        `| ${m.nome.slice(0, 42)} | ${no?.role?.value ?? '⚠ não é um disclosure'} | ` +
          `**${exp ? exp.value.value : '(ausente)'}** | ${m.escritoAMao ?? 'nenhum'} | ` +
          `${m.alturaPx}px ${alvoOk} |`,
      )
    }
    await contexto.close()
  }
} finally {
  await navegador.close()
}
