import { describe, expect, it } from 'vitest'
import { percentualDaLista, rotuloComPercentual } from './percentual'

describe('percentualDaLista', () => {
  it('soma zero não tem percentual (requisito explícito da ordem RV-08)', () => {
    expect(percentualDaLista(0, 0)).toBeNull()
    expect(percentualDaLista(5, 0)).toBeNull()
  })

  it('total negativo também não tem leitura relativa', () => {
    expect(percentualDaLista(5, -10)).toBeNull()
  })

  it('lista de 1 item: ele é 100% de si mesmo', () => {
    expect(percentualDaLista(5, 5)).toBe(100)
  })

  it('valor 0 com total válido é 0% — leitura real, não ausência', () => {
    expect(percentualDaLista(0, 40)).toBe(0)
  })

  it('item pequeno arredonda para 0% mas não é null (não pode sumir do rótulo)', () => {
    // 1/1000 = 0,1% → Math.round dá 0, mas a leitura existe (não é o caso de
    // total<=0). rotuloComPercentual mostra "0%" para este caso — ver abaixo.
    expect(percentualDaLista(1, 1000)).toBe(0)
  })

  it('arredonda para o inteiro mais próximo (meio-para-cima, padrão do Math.round)', () => {
    expect(percentualDaLista(1, 3)).toBe(33) // 33,33…
    expect(percentualDaLista(2, 3)).toBe(67) // 66,66… → 67
  })

  it('a soma dos percentuais da lista pode passar de 100% — arredondamento por item, sem distribuição de resto', () => {
    // 3/8=37,5% e 2/8=25% exatos. Math.round(37.5) sobe (meio-para-cima do JS):
    // 38 + 38 + 25 = 101. A régua aceita isso — cada item está certo consigo
    // mesmo; não fechar em 100% é o preço de nunca mentir para quem lê 1 linha.
    const a = percentualDaLista(3, 8)
    const b = percentualDaLista(3, 8)
    const c = percentualDaLista(2, 8)
    expect(a).toBe(38)
    expect(b).toBe(38)
    expect(c).toBe(25)
    expect((a ?? 0) + (b ?? 0) + (c ?? 0)).toBe(101)
  })

  it('entradas não finitas (NaN/Infinity) em valor ou total não têm percentual', () => {
    expect(percentualDaLista(NaN, 10)).toBeNull()
    expect(percentualDaLista(Infinity, 10)).toBeNull()
    expect(percentualDaLista(10, NaN)).toBeNull()
    expect(percentualDaLista(10, Infinity)).toBeNull()
  })

  it('valor negativo não tem percentual, mesmo com total válido', () => {
    expect(percentualDaLista(-5, 10)).toBeNull()
  })
})

describe('rotuloComPercentual', () => {
  it('soma zero: valor formatado normalmente, percentual null', () => {
    expect(rotuloComPercentual(219, 0)).toEqual({ valor: '219', percentual: null })
  })

  it('caso normal: 219 de 420 → 52%', () => {
    expect(rotuloComPercentual(219, 420)).toEqual({ valor: '219', percentual: '52%' })
  })

  it('valor 0 com total válido mostra "0%", não null', () => {
    expect(rotuloComPercentual(0, 40)).toEqual({ valor: '0', percentual: '0%' })
  })

  it('item que arredonda para 0% aparece como "0%" — não some do rótulo', () => {
    expect(rotuloComPercentual(1, 1000)).toEqual({ valor: '1', percentual: '0%' })
  })

  it('formata o valor em pt-BR (separador de milhar)', () => {
    expect(rotuloComPercentual(1234, 2000)).toEqual({ valor: '1.234', percentual: '62%' })
  })
})
