import { describe, it, expect } from 'vitest'
import {
  ehFimDeSemana,
  ehBaldeDeHoje,
  OPACIDADE_BALDE_PARCIAL,
} from '@/lib/relatorios/calendario-serie'

describe('ehFimDeSemana', () => {
  it('reconhece sábado e domingo', () => {
    expect(ehFimDeSemana('2026-08-08')).toBe(true) // sábado
    expect(ehFimDeSemana('2026-08-09')).toBe(true) // domingo
  })

  it('rejeita dia útil (segunda)', () => {
    expect(ehFimDeSemana('2026-08-10')).toBe(false) // segunda (hoje, no cenário da OS)
  })

  it('atravessa a virada de mês sem escorregar de fuso (31/jan sáb → 1/fev dom)', () => {
    expect(ehFimDeSemana('2026-01-31')).toBe(true) // sábado
    expect(ehFimDeSemana('2026-02-01')).toBe(true) // domingo
    expect(ehFimDeSemana('2026-02-02')).toBe(false) // segunda
  })

  it('atravessa a virada de ano (31/dez/2026 é quinta; 2–3/jan/2027 é sáb/dom)', () => {
    expect(ehFimDeSemana('2026-12-31')).toBe(false) // quinta
    expect(ehFimDeSemana('2027-01-01')).toBe(false) // sexta
    expect(ehFimDeSemana('2027-01-02')).toBe(true) // sábado
    expect(ehFimDeSemana('2027-01-03')).toBe(true) // domingo
  })

  it('chave de MÊS (yyyy-MM) não é chave de dia — sempre false', () => {
    expect(ehFimDeSemana('2026-08')).toBe(false)
    expect(ehFimDeSemana('2026-02')).toBe(false)
  })

  it('string vazia ou malformada — false, nunca lança', () => {
    expect(ehFimDeSemana('')).toBe(false)
    expect(ehFimDeSemana('não é data')).toBe(false)
    expect(ehFimDeSemana('2026/08/08')).toBe(false)
    expect(ehFimDeSemana('26-08-08')).toBe(false)
  })
})

describe('ehBaldeDeHoje', () => {
  const HOJE = '2026-08-10'

  it('granularidade DIA: true só quando a chave bate com hoje', () => {
    expect(ehBaldeDeHoje(HOJE, 'dia', HOJE)).toBe(true)
    expect(ehBaldeDeHoje('2026-08-09', 'dia', HOJE)).toBe(false)
    expect(ehBaldeDeHoje('2026-08-11', 'dia', HOJE)).toBe(false)
  })

  it('granularidade SEMANA: sempre false, mesmo que a chave (segunda) seja hoje', () => {
    // a semana corrente quase sempre está "em curso" — marcar o balde inteiro
    // como parcial viraria ruído permanente, não um aviso pontual.
    expect(ehBaldeDeHoje(HOJE, 'semana', HOJE)).toBe(false)
    expect(ehBaldeDeHoje('2026-08-03', 'semana', HOJE)).toBe(false)
  })

  it('granularidade MÊS: sempre false, mesmo que a chave (yyyy-MM de hoje) bata', () => {
    expect(ehBaldeDeHoje('2026-08', 'mes', HOJE)).toBe(false)
  })
})

describe('OPACIDADE_BALDE_PARCIAL', () => {
  it('é uma opacidade válida (0 < x < 1) — nem invisível, nem indistinguível da barra cheia', () => {
    expect(OPACIDADE_BALDE_PARCIAL).toBeGreaterThan(0)
    expect(OPACIDADE_BALDE_PARCIAL).toBeLessThan(1)
  })
})
