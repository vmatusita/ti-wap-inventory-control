import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Marca } from './marca'

// A MARCA COMO PONTO DE INJEÇÃO (F61) — rig de componente grau 1 (F45).
//
// O que quebraria em silêncio sem este teste:
//   · a sigla voltar a ser texto no JSX (a F70 trocaria a fonte e a tela continuaria
//     dizendo `WAP`) — o teste passa OUTRA sigla e confere que é ela que aparece;
//   · o chip voltar a `text-black` cru — nenhuma cor mudaria na tela, e
//     `scripts/contraste.mjs` passaria a medir um par que ninguém usa;
//   · o rótulo padrão sair de outro lugar que não a fonte única.
// Render estático; nada de clique.

/** A `className` do primeiro `<span>` (o chip). */
function classesDoChip(html: string): string[] {
  const m = html.match(/<span class="([^"]+)"/)
  return m ? m[1].split(/\s+/) : []
}

describe('Marca — a sigla e o nome chegam por prop, com o padrão da fonte única', () => {
  it('sem prop, mostra a sigla e o nome de hoje', () => {
    const html = renderToStaticMarkup(<Marca />)
    expect(html).toContain('>WAP</span>')
    expect(html).toContain('>Estoque TI</span>')
  })

  it('a sigla e o nome passados por prop substituem os da fonte', () => {
    const html = renderToStaticMarkup(<Marca sigla="ACME" label="Inventário" />)
    expect(html).toContain('>ACME</span>')
    expect(html).toContain('>Inventário</span>')
    expect(html).not.toContain('WAP')
    expect(html).not.toContain('Estoque TI')
  })

  it('o chip usa o PAR de tokens da marca — nunca o preto cru', () => {
    const chip = classesDoChip(renderToStaticMarkup(<Marca />))
    expect(chip).toContain('bg-brand-amarelo')
    expect(chip).toContain('text-brand-amarelo-texto')
    expect(chip).not.toContain('text-black')
  })

  it('o tamanho grande muda só a escala do texto, não o par', () => {
    const chip = classesDoChip(renderToStaticMarkup(<Marca size="lg" labelClassName="text-brand-dark-texto" />))
    expect(chip).toContain('text-sm')
    expect(chip).toContain('text-brand-amarelo-texto')
  })
})
