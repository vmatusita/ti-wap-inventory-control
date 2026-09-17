import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Badge } from './badge'

// A VARIANTE `sucesso` DO SELO (F61) — rig de componente grau 1 (F45).
//
// `sucesso` é adição do projeto ao kit (ata em docs/DECISOES.md, no molde do
// `warning` da F7F). O que quebraria em silêncio: a variante ganhar opacidade (o
// molde do `warning`, `bg-warning/10`) e repintar os selos "Ativo" — ou voltar a
// paleta crua. Nenhum dos dois quebra build nem lint; só o HTML mostra.

function classes(html: string): string[] {
  const m = html.match(/class="([^"]+)"/)
  return m ? m[1].split(/\s+/) : []
}

describe('Badge variant="sucesso"', () => {
  const html = renderToStaticMarkup(<Badge variant="sucesso">Ativo</Badge>)
  const lista = classes(html)

  it('pinta pelo PAR de tokens, sem opacidade', () => {
    expect(lista).toContain('bg-sucesso')
    expect(lista).toContain('text-sucesso-texto')
    expect(lista.some((c) => /^bg-sucesso\/\d+$/.test(c))).toBe(false)
  })

  it('não carrega paleta crua nem a cor da variante padrão', () => {
    expect(lista.some((c) => /(^|:)(bg|text)-green-\d+/.test(c))).toBe(false)
    expect(lista).not.toContain('bg-primary')
    expect(lista).not.toContain('text-primary-foreground')
  })

  it('marca a variante no HTML, como as outras', () => {
    expect(html).toContain('data-variant="sucesso"')
    expect(html).toContain('>Ativo</span>')
  })
})
