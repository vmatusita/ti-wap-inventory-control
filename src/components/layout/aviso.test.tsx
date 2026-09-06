import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Aviso, type IntencaoDoAviso } from './aviso'

// SEMENTE 1 do piso de teste de componente (F45).
//
// O que ela protege: o par intenção → papel de acessibilidade. A F40 criou este
// componente justamente para corrigir uma assimetria de 8:1 entre `role="alert"`
// (39 usos) e `aria-live` (5) — quase tudo interrompia a leitura, inclusive o que
// só informava. O mapa `PAPEL` é a correção, e ele é invisível: nenhum teste de
// função pura o alcança, `npm run build` não o vê, e a tela parece igual dos dois
// jeitos. Só quem usa leitor de tela percebe a regressão.
//
// Render ESTÁTICO por `renderToStaticMarkup` — sem jsdom, sem Testing Library,
// sem dependência nova. É o que o servidor manda para o navegador, que é onde o
// atributo ou está ou não está.

function papelDe(html: string): string | null {
  const m = html.match(/\srole="([^"]+)"/)
  return m ? m[1] : null
}

describe('Aviso — a intenção escolhe o papel de acessibilidade', () => {
  const esperado: [IntencaoDoAviso, string | null][] = [
    // Erro INTERROMPE: o leitor de tela fala na hora.
    ['erro', 'alert'],
    // Atenção INFORMA: fala quando puder.
    ['atencao', 'status'],
    // Informação não anuncia nada.
    ['informacao', null],
  ]

  it.each(esperado)('intenção %s → papel %s', (intencao, papel) => {
    const html = renderToStaticMarkup(<Aviso intencao={intencao}>Texto do aviso</Aviso>)
    expect(papelDe(html)).toBe(papel)
  })

  it('o padrão, sem prop, é `erro` — e portanto interrompe', () => {
    expect(papelDe(renderToStaticMarkup(<Aviso>Deu ruim</Aviso>))).toBe('alert')
  })

  it('o texto do aviso chega ao HTML (a cor nunca é o único sinal)', () => {
    const html = renderToStaticMarkup(<Aviso intencao="atencao">Faltou o patrimônio</Aviso>)
    expect(html).toContain('Faltou o patrimônio')
  })

  it('os três papéis são distintos entre si — nenhum caiu no do vizinho', () => {
    const papeis = esperado.map(([intencao]) =>
      papelDe(renderToStaticMarkup(<Aviso intencao={intencao}>x</Aviso>)),
    )
    expect(new Set(papeis).size).toBe(3)
  })
})
