import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateTime,
  ouTraco,
  hojeISO,
  dataEmSP,
  fimDoDiaSP,
} from '@/lib/format'

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
