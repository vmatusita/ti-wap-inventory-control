import { describe, it, expect } from 'vitest'
import {
  alternarSerieIsolada,
  opacidadeComposta,
  OPACIDADE_SERIE_ATENUADA,
} from '@/lib/relatorios/serie-isolada'

describe('alternarSerieIsolada', () => {
  it('nada isolado + clique em uma série → isola ela', () => {
    expect(alternarSerieIsolada(null, 'saidas')).toBe('saidas')
    expect(alternarSerieIsolada(null, 'devolucoes')).toBe('devolucoes')
  })

  it('clicar na série JÁ isolada restaura (volta a null)', () => {
    expect(alternarSerieIsolada('saidas', 'saidas')).toBeNull()
    expect(alternarSerieIsolada('devolucoes', 'devolucoes')).toBeNull()
  })

  it('clicar na OUTRA série troca o isolamento (nunca as duas isoladas)', () => {
    expect(alternarSerieIsolada('saidas', 'devolucoes')).toBe('devolucoes')
    expect(alternarSerieIsolada('devolucoes', 'saidas')).toBe('saidas')
  })
})

describe('opacidadeComposta', () => {
  it('série não atenuada: devolve a opacidade do balde intacta', () => {
    expect(opacidadeComposta(1, false)).toBe(1)
    expect(opacidadeComposta(0.55, false)).toBe(0.55)
  })

  it('série atenuada sobre balde cheio: aplica só o fator de isolamento', () => {
    expect(opacidadeComposta(1, true)).toBe(OPACIDADE_SERIE_ATENUADA)
  })

  it('série atenuada E balde parcial no MESMO retângulo: os dois efeitos multiplicam', () => {
    // 0,55 (balde de hoje) × 0,25 (isolamento) — mais apagado que qualquer um
    // dos dois sozinho, não travado no mais forte deles.
    expect(opacidadeComposta(0.55, true)).toBeCloseTo(0.55 * OPACIDADE_SERIE_ATENUADA)
  })

  it('OPACIDADE_SERIE_ATENUADA é uma opacidade válida (0 < x < 1) e mais forte que o balde parcial (0,55)', () => {
    expect(OPACIDADE_SERIE_ATENUADA).toBeGreaterThan(0)
    expect(OPACIDADE_SERIE_ATENUADA).toBeLessThan(1)
    // isolar é ação deliberada do operador — precisa ler mais forte que o
    // aviso passivo do balde parcial.
    expect(OPACIDADE_SERIE_ATENUADA).toBeLessThan(0.55)
  })
})
