import { describe, it, expect } from 'vitest'
import { chipAtivo, periodoDoChip } from '@/lib/movimentacoes/chips-periodo'

describe('periodoDoChip — período de cada chip a partir de uma data fixa', () => {
  it('hoje: de e até são o mesmo dia', () => {
    expect(periodoDoChip('hoje', '2026-08-07')).toEqual({
      de: '2026-08-07',
      ate: '2026-08-07',
    })
  })

  it('ontem: de e até são o dia anterior', () => {
    expect(periodoDoChip('ontem', '2026-08-07')).toEqual({
      de: '2026-08-06',
      ate: '2026-08-06',
    })
  })

  it('7dias: os últimos 7 dias INCLUINDO hoje (subDays(hoje, 6)..hoje)', () => {
    expect(periodoDoChip('7dias', '2026-08-07')).toEqual({
      de: '2026-08-01',
      ate: '2026-08-07',
    })
  })

  it('ontem na virada do mês', () => {
    expect(periodoDoChip('ontem', '2026-08-01')).toEqual({
      de: '2026-07-31',
      ate: '2026-07-31',
    })
  })

  it('7dias atravessando a virada do mês', () => {
    expect(periodoDoChip('7dias', '2026-08-03')).toEqual({
      de: '2026-07-28',
      ate: '2026-08-03',
    })
  })

  it('7dias em ano bissexto atravessa 29/02', () => {
    // 2028 é bissexto. subDays(2028-03-02, 6) = 2028-02-25.
    expect(periodoDoChip('7dias', '2028-03-02')).toEqual({
      de: '2028-02-25',
      ate: '2028-03-02',
    })
  })

  it('ontem cruza a virada de ano', () => {
    expect(periodoDoChip('ontem', '2027-01-01')).toEqual({
      de: '2026-12-31',
      ate: '2026-12-31',
    })
  })
})

describe('chipAtivo — qual chip corresponde ao de/ate correntes', () => {
  const hoje = '2026-08-07'

  it('reconhece Hoje', () => {
    expect(chipAtivo('2026-08-07', '2026-08-07', hoje)).toBe('hoje')
  })

  it('reconhece Ontem', () => {
    expect(chipAtivo('2026-08-06', '2026-08-06', hoje)).toBe('ontem')
  })

  it('reconhece 7 dias', () => {
    expect(chipAtivo('2026-08-01', '2026-08-07', hoje)).toBe('7dias')
  })

  it('de/ate fora de qualquer chip → null', () => {
    expect(chipAtivo('2026-07-01', '2026-07-15', hoje)).toBeNull()
  })

  it('só de preenchido (ate vazio) → null', () => {
    expect(chipAtivo('2026-08-07', '', hoje)).toBeNull()
  })

  it('só ate preenchido (de vazio) → null', () => {
    expect(chipAtivo('', '2026-08-07', hoje)).toBeNull()
  })

  it('os dois vazios → null', () => {
    expect(chipAtivo('', '', hoje)).toBeNull()
  })

  it('datas iguais às de "7 dias" mas com 1 dia a mais não casam com nenhum chip', () => {
    expect(chipAtivo('2026-07-31', '2026-08-07', hoje)).toBeNull()
  })
})
