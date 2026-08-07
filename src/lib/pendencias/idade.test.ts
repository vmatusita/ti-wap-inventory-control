import { describe, expect, it } from 'vitest'
import {
  faixaIdadePendencia,
  PENDENCIA_ATENCAO_DIAS,
  PENDENCIA_CRITICA_DIAS,
} from './idade'

describe('PENDENCIA_ATENCAO_DIAS / PENDENCIA_CRITICA_DIAS', () => {
  it('são 30 e 90', () => {
    expect(PENDENCIA_ATENCAO_DIAS).toBe(30)
    expect(PENDENCIA_CRITICA_DIAS).toBe(90)
  })
})

describe('faixaIdadePendencia', () => {
  it('dias nulo (sem data de abertura conhecida) é sempre "nova"', () => {
    expect(faixaIdadePendencia(null)).toBe('nova')
  })

  it('0 dias (aberta hoje) é "nova"', () => {
    expect(faixaIdadePendencia(0)).toBe('nova')
  })

  // Limiar de atenção — EXCLUSIVO: no dia 30 ainda é 'nova', só o 31 vira 'atencao'.
  it('29 dias é "nova"', () => {
    expect(faixaIdadePendencia(29)).toBe('nova')
  })
  it('30 dias (no limiar exato) ainda é "nova"', () => {
    expect(faixaIdadePendencia(30)).toBe('nova')
  })
  it('31 dias (passou do limiar) é "atencao"', () => {
    expect(faixaIdadePendencia(31)).toBe('atencao')
  })

  // Limiar crítico — mesma regra exclusiva: no dia 90 ainda é 'atencao'.
  it('89 dias é "atencao"', () => {
    expect(faixaIdadePendencia(89)).toBe('atencao')
  })
  it('90 dias (no limiar exato) ainda é "atencao"', () => {
    expect(faixaIdadePendencia(90)).toBe('atencao')
  })
  it('91 dias (passou do limiar) é "critica"', () => {
    expect(faixaIdadePendencia(91)).toBe('critica')
  })
})
