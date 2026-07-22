import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  formatDate,
  formatDateTime,
  ouTraco,
  hojeISO,
  ontemISO,
  dataEmSP,
  fimDoDiaSP,
} from '@/lib/format'

afterEach(() => {
  vi.useRealTimers()
})

describe('formatDate', () => {
  it('formata data pura yyyy-MM-dd como dd/MM/yyyy', () => {
    expect(formatDate('2026-07-14')).toBe('14/07/2026')
  })

  it('renderiza timestamptz no fuso de São Paulo (UTC-3), sem virar o dia', () => {
    // 02:00Z = 23:00 do dia ANTERIOR em São Paulo → a data é 13, não 14.
    expect(formatDate('2026-07-14T02:00:00Z')).toBe('13/07/2026')
    // 12:00Z = 09:00 em SP → mesmo dia.
    expect(formatDate('2026-07-14T12:00:00Z')).toBe('14/07/2026')
  })

  it('trata nulo/vazio como travessão e entrada inválida como si mesma', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('lixo')).toBe('lixo')
  })
})

describe('formatDateTime', () => {
  it('exibe data e hora no fuso de SP', () => {
    expect(formatDateTime('2026-07-14T02:00:00Z')).toBe('13/07/2026 às 23:00')
  })

  it('travessão para nulo', () => {
    expect(formatDateTime(null)).toBe('—')
  })
})

describe('ouTraco', () => {
  it('devolve travessão para vazio/espaços/nulo e o valor caso contrário', () => {
    expect(ouTraco('')).toBe('—')
    expect(ouTraco('   ')).toBe('—')
    expect(ouTraco(null)).toBe('—')
    expect(ouTraco('texto')).toBe('texto')
  })
})

describe('dataEmSP', () => {
  it('extrai a data (yyyy-MM-dd) de um instante já no fuso de SP', () => {
    expect(dataEmSP('2026-07-14T02:00:00Z')).toBe('2026-07-13')
    expect(dataEmSP('2026-07-14T12:00:00Z')).toBe('2026-07-14')
  })
})

describe('hojeISO', () => {
  it('devolve uma data pura yyyy-MM-dd', () => {
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('usa o fuso de SP, não o UTC, depois das 21:00 BRT', () => {
    // 2026-07-15T00:30:00Z = 21:30 de 14/07 em São Paulo. Em UTC já é dia 15 —
    // `toISOString().slice(0,10)` erraria o dia; `hojeISO` tem de dizer 14.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T00:30:00Z'))
    expect(hojeISO()).toBe('2026-07-14')
  })
})

describe('ontemISO', () => {
  it('devolve uma data pura yyyy-MM-dd', () => {
    expect(ontemISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('é exatamente um dia antes de hojeISO', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T15:00:00Z')) // 12:00 em SP
    expect(hojeISO()).toBe('2026-07-14')
    expect(ontemISO()).toBe('2026-07-13')
  })

  it('respeita o fuso de SP na virada do dia UTC (21:00 BRT)', () => {
    // 21:30 BRT de 14/07 (00:30Z de 15/07): hoje = 14, ontem = 13. Um cálculo
    // em UTC devolveria 15 e 14.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T00:30:00Z'))
    expect(hojeISO()).toBe('2026-07-14')
    expect(ontemISO()).toBe('2026-07-13')
  })

  it('atravessa a virada de mês sem quebrar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z')) // 09:00 de 01/08 em SP
    expect(hojeISO()).toBe('2026-08-01')
    expect(ontemISO()).toBe('2026-07-31')
  })
})

describe('fimDoDiaSP', () => {
  it('devolve o fim do dia com o offset de São Paulo (UTC-3)', () => {
    expect(fimDoDiaSP('2026-07-14')).toBe('2026-07-14T23:59:59.999-03:00')
  })

  it('representa o instante final do dia em SP — 02:59:59.999Z do dia seguinte', () => {
    // 23:59:59.999 BRT = 02:59:59.999Z do dia seguinte. Prova que é fim de dia em
    // SP (não em UTC): um teto UTC perderia as últimas 3h do dia.
    expect(new Date(fimDoDiaSP('2026-07-14')).toISOString()).toBe('2026-07-15T02:59:59.999Z')
  })
})
