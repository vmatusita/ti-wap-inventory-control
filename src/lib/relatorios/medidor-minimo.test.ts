import { describe, expect, it } from 'vitest'
import {
  FOLGA_ABSOLUTA_MINIMA,
  bandaDeLimite,
  fracaoMedidor,
  nivelMedidor,
  rotuloMedidor,
} from '@/lib/relatorios/medidor-minimo'

describe('bandaDeLimite — as duas parcelas', () => {
  it('no miúdo manda a parcela absoluta', () => {
    // 20% de 5 é 1; a banda não desce abaixo de 2.
    expect(bandaDeLimite(5)).toBe(FOLGA_ABSOLUTA_MINIMA)
    expect(bandaDeLimite(1)).toBe(2)
  })

  it('no graúdo manda a parcela proporcional', () => {
    expect(bandaDeLimite(200)).toBe(40)
    expect(bandaDeLimite(30)).toBe(6)
  })

  it('arredonda a proporção para CIMA (a banda nunca encolhe por arredondamento)', () => {
    // 20% de 11 é 2,2 → 3.
    expect(bandaDeLimite(11)).toBe(3)
  })
})

describe('nivelMedidor', () => {
  it('abaixo do mínimo é falta', () => {
    expect(nivelMedidor(0, 10)).toBe('falta')
    expect(nivelMedidor(9, 10)).toBe('falta')
  })

  it('exatamente no mínimo ainda é limite — atingir o mínimo não é folga', () => {
    expect(nivelMedidor(10, 10)).toBe('limite')
  })

  it('dentro da banda é limite; um passo além é folga', () => {
    // mínimo 10 → banda max(2, 2) = 2 → limite até 12, folga a partir de 13.
    expect(nivelMedidor(12, 10)).toBe('limite')
    expect(nivelMedidor(13, 10)).toBe('folga')
  })

  it('mínimo grande usa a banda proporcional', () => {
    // mínimo 100 → banda 20 → limite até 120.
    expect(nivelMedidor(120, 100)).toBe('limite')
    expect(nivelMedidor(121, 100)).toBe('folga')
  })

  it('sem mínimo cadastrado não há medidor', () => {
    expect(nivelMedidor(5, null)).toBeNull()
    expect(nivelMedidor(5, undefined)).toBeNull()
    expect(nivelMedidor(5, 0)).toBeNull()
    expect(nivelMedidor(5, -3)).toBeNull()
  })

  it('entrada não finita não desenha medidor em vez de desenhar um errado', () => {
    expect(nivelMedidor(Number.NaN, 10)).toBeNull()
    expect(nivelMedidor(5, Number.NaN)).toBeNull()
    expect(nivelMedidor(5, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('fracaoMedidor', () => {
  it('mede quanto do mínimo está coberto', () => {
    expect(fracaoMedidor(5, 10)).toBeCloseTo(0.5, 5)
    expect(fracaoMedidor(0, 10)).toBe(0)
  })

  it('não passa de 1 — a barra mede cobertura, não excesso', () => {
    expect(fracaoMedidor(10, 10)).toBe(1)
    expect(fracaoMedidor(300, 10)).toBe(1)
  })

  it('sem mínimo, sem preenchimento', () => {
    expect(fracaoMedidor(5, null)).toBe(0)
    expect(fracaoMedidor(5, 0)).toBe(0)
  })

  it('estoque negativo não desenha barra ao contrário', () => {
    expect(fracaoMedidor(-4, 10)).toBe(0)
  })
})

describe('rotuloMedidor — o canal que sobrevive ao P&B e ao leitor de tela', () => {
  it('diz o nível E o alvo, nos três estados', () => {
    expect(rotuloMedidor(4, 10)).toBe('abaixo do mínimo 10')
    expect(rotuloMedidor(11, 10)).toBe('no limite do mínimo 10')
    expect(rotuloMedidor(50, 10)).toBe('acima do mínimo 10')
  })

  it('formata o número em pt-BR', () => {
    expect(rotuloMedidor(500, 1000)).toBe('abaixo do mínimo 1.000')
  })

  it('sem mínimo não há rótulo (nem medidor)', () => {
    expect(rotuloMedidor(5, null)).toBeNull()
  })
})
