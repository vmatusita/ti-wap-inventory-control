import { describe, expect, it } from 'vitest'
import { montarChipsAncora } from './ancora-contagem'

const ZERO = { saidas: 0, entradas: 0, transferencias: 0, movItens: 0 }

function hrefs(chips: ReturnType<typeof montarChipsAncora>) {
  return chips.map((c) => c.href)
}

describe('montarChipsAncora', () => {
  it('chips estruturais nunca levam número, mesmo com tudo zerado', () => {
    const chips = montarChipsAncora(ZERO)
    for (const href of ['#principais', '#resumo', '#como-ler']) {
      const chip = chips.find((c) => c.href === href)
      expect(chip?.numero).toBeUndefined()
    }
  })

  it('Acessórios/Componentes/Saídas/Entradas sempre aparecem, com número (0 quando vazio)', () => {
    const chips = montarChipsAncora(ZERO)
    expect(chips.find((c) => c.href === '#acessorios')).toEqual({
      href: '#acessorios',
      rotulo: 'Acessórios',
      numero: 0,
    })
    expect(chips.find((c) => c.href === '#componentes')).toEqual({
      href: '#componentes',
      rotulo: 'Componentes',
      numero: 0,
    })
    expect(chips.find((c) => c.href === '#saidas')?.numero).toBe(0)
    expect(chips.find((c) => c.href === '#entradas')?.numero).toBe(0)
  })

  it('acessorios/componentes indefinidos (find sem resultado) caem para 0, não somem', () => {
    const chips = montarChipsAncora(ZERO) // acessorios/componentes ausentes no objeto
    expect(hrefs(chips)).toContain('#acessorios')
    expect(hrefs(chips)).toContain('#componentes')
  })

  it('Transferências e Itens somem com contagem zero e aparecem com contagem > 0', () => {
    expect(hrefs(montarChipsAncora(ZERO))).not.toContain('#transferencias')
    expect(hrefs(montarChipsAncora(ZERO))).not.toContain('#mov-itens')

    const chips = montarChipsAncora({ ...ZERO, transferencias: 3, movItens: 19 })
    expect(chips.find((c) => c.href === '#transferencias')).toEqual({
      href: '#transferencias',
      rotulo: 'Transferências',
      numero: 3,
    })
    expect(chips.find((c) => c.href === '#mov-itens')).toEqual({
      href: '#mov-itens',
      rotulo: 'Itens',
      numero: 19,
    })
  })

  it('Observações só aparece com temObservacao=true, e sem número (chip estrutural)', () => {
    expect(hrefs(montarChipsAncora(ZERO))).not.toContain('#observacao')
    const chips = montarChipsAncora({ ...ZERO, temObservacao: true })
    expect(chips.find((c) => c.href === '#observacao')).toEqual({
      href: '#observacao',
      rotulo: 'Observações',
    })
  })

  it('preserva a ordem de sempre com tudo presente', () => {
    const chips = montarChipsAncora({
      acessorios: 5,
      componentes: 2,
      saidas: 19,
      entradas: 4,
      transferencias: 1,
      movItens: 7,
      temObservacao: true,
    })
    expect(hrefs(chips)).toEqual([
      '#principais',
      '#acessorios',
      '#componentes',
      '#saidas',
      '#entradas',
      '#transferencias',
      '#mov-itens',
      '#resumo',
      '#observacao',
      '#como-ler',
    ])
  })
})
