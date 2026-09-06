import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { CabecalhoDaPagina } from './pagina'

// SEMENTE 3 do piso de teste de componente (F45).
//
// O que ela protege: o `<h1>` da página existe, é UM só, e é o título. A regra 1
// de `src/lib/layout/consistencia.test.ts` proíbe que uma tela escreva o próprio
// `<h1>` — a razão de a régua funcionar é que ESTE componente escreve um. As duas
// pontas nunca tinham sido amarradas: a régua olha o TEXTO das telas, e ninguém
// olhava o HTML que sai daqui. Trocar o `<h1>` por um `<div>` aqui deixaria o
// produto inteiro sem título de nível 1, com a régua verde.
//
// Render ESTÁTICO por `renderToStaticMarkup`. As props que exigem contexto de
// rota (`ajuda`, que monta um `LinkAjuda`) ficam de fora de propósito: o piso é
// grau 1, e o que se afirma aqui é a estrutura do cabeçalho.

function h1s(html: string): string[] {
  return [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/g)].map((m) => m[1])
}

describe('CabecalhoDaPagina — o <h1> da tela mora aqui, e só aqui', () => {
  it('o título vira exatamente UM <h1>', () => {
    const html = renderToStaticMarkup(<CabecalhoDaPagina titulo="Ativos" />)
    expect(h1s(html)).toEqual(['Ativos'])
  })

  it('descrição, ações e o que vai ao lado NÃO viram título de nível 1', () => {
    const html = renderToStaticMarkup(
      <CabecalhoDaPagina
        titulo="Itens"
        descricao="Saldos por filial"
        acoes={<button type="button">Lançar</button>}
        aoLado={<span>em estoque</span>}
      />,
    )
    expect(h1s(html)).toEqual(['Itens'])
    expect(html).toContain('Saldos por filial')
    expect(html).toContain('Lançar')
    expect(html).toContain('em estoque')
  })

  it('o cabeçalho é um <header> (marco de navegação, não um <div> qualquer)', () => {
    const html = renderToStaticMarkup(<CabecalhoDaPagina titulo="Movimentações" />)
    expect(html.startsWith('<header')).toBe(true)
  })

  it('título com marcação (o patrimônio em tabular-nums da ficha) fica DENTRO do <h1>', () => {
    // É o caso real de /ativos/[id]: a ficha passa nó, não string, justamente
    // para não ter de escrever o próprio <h1> — ver o comentário da prop.
    const html = renderToStaticMarkup(
      <CabecalhoDaPagina titulo={<span className="tabular-nums">WAP0004491</span>} />,
    )
    expect(h1s(html)).toEqual(['<span class="tabular-nums">WAP0004491</span>'])
  })

  it('sem descrição e sem ações, nada de bloco vazio sobrando', () => {
    const html = renderToStaticMarkup(<CabecalhoDaPagina titulo="Pendências" />)
    expect(html).not.toContain('text-muted-foreground')
  })
})
