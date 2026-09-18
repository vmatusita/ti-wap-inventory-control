import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatTempoRelativo,
  ouTraco,
  hojeISO,
  ontemISO,
  dataEmSP,
  fimDoDiaSP,
  inicioDoDiaSP,
  diaSeguinteISO,
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

describe('formatTime (F28 · MOV-06)', () => {
  it('devolve só HH:mm no fuso de São Paulo', () => {
    // 15:00Z = 12:00 BRT.
    expect(formatTime('2026-07-14T15:00:00Z')).toBe('12:00')
  })

  it('não adianta 3 h — a hora é a de SP, não a de UTC', () => {
    // Se fatiasse a string ISO, devolveria '23:40'.
    expect(formatTime('2026-07-14T23:40:00Z')).toBe('20:40')
  })

  it('usa relógio de 24 h (sem AM/PM)', () => {
    expect(formatTime('2026-07-14T02:05:00Z')).toBe('23:05')
  })

  it('vazio, nulo e lixo viram travessão', () => {
    expect(formatTime(null)).toBe('—')
    expect(formatTime(undefined)).toBe('—')
    expect(formatTime('')).toBe('—')
    expect(formatTime('nao-e-data')).toBe('—')
  })
})

describe('formatTempoRelativo (F28 · MOV-11)', () => {
  const agora = new Date('2026-08-07T15:00:00Z').getTime()

  it('menos de um minuto é "agora mesmo"', () => {
    expect(formatTempoRelativo('2026-08-07T14:59:30Z', agora)).toBe('agora mesmo')
  })

  it('minutos', () => {
    expect(formatTempoRelativo('2026-08-07T14:58:00Z', agora)).toBe('há 2 min')
    expect(formatTempoRelativo('2026-08-07T14:01:00Z', agora)).toBe('há 59 min')
  })

  it('horas', () => {
    expect(formatTempoRelativo('2026-08-07T13:00:00Z', agora)).toBe('há 2 h')
    expect(formatTempoRelativo('2026-08-06T16:00:00Z', agora)).toBe('há 23 h')
  })

  it('dias — singular e plural', () => {
    expect(formatTempoRelativo('2026-08-06T15:00:00Z', agora)).toBe('há 1 dia')
    expect(formatTempoRelativo('2026-08-04T15:00:00Z', agora)).toBe('há 3 dias')
  })

  it('instante no futuro (relógio do cliente atrasado) cai em "agora mesmo"', () => {
    // Nunca "há -3 min": o rascunho é gravado pelo navegador, mas o relógio pode
    // andar para trás entre a gravação e a leitura.
    expect(formatTempoRelativo('2026-08-07T15:10:00Z', agora)).toBe('agora mesmo')
  })

  it('vazio, nulo e lixo devolvem string vazia (o banner some o trecho)', () => {
    expect(formatTempoRelativo(null, agora)).toBe('')
    expect(formatTempoRelativo(undefined, agora)).toBe('')
    expect(formatTempoRelativo('nao-e-data', agora)).toBe('')
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

describe('inicioDoDiaSP', () => {
  it('devolve o início do dia com o offset de São Paulo (UTC-3)', () => {
    expect(inicioDoDiaSP('2026-07-14')).toBe('2026-07-14T00:00:00-03:00')
  })

  it('representa a meia-noite de SP — 03:00Z do mesmo dia', () => {
    expect(new Date(inicioDoDiaSP('2026-07-14')).toISOString()).toBe('2026-07-14T03:00:00.000Z')
  })
})

describe('diaSeguinteISO', () => {
  it('avança um dia de calendário', () => {
    expect(diaSeguinteISO('2026-07-14')).toBe('2026-07-15')
  })

  it('vira mês, ano e fevereiro de ano bissexto', () => {
    expect(diaSeguinteISO('2026-07-31')).toBe('2026-08-01')
    expect(diaSeguinteISO('2026-12-31')).toBe('2027-01-01')
    expect(diaSeguinteISO('2028-02-28')).toBe('2028-02-29')
    expect(diaSeguinteISO('2026-02-28')).toBe('2026-03-01')
  })

  it('com inicioDoDiaSP, o teto exclusivo cobre o último dia inteiro em SP', () => {
    // 23:59:59.999 BRT de 14/07 ainda cai ANTES do teto; 00:00 BRT de 15/07, não.
    const teto = new Date(inicioDoDiaSP(diaSeguinteISO('2026-07-14'))).getTime()
    expect(new Date(fimDoDiaSP('2026-07-14')).getTime()).toBeLessThan(teto)
    expect(new Date('2026-07-15T00:00:00-03:00').getTime()).toBe(teto)
  })
})
