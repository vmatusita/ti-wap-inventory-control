import { describe, it, expect } from 'vitest'
import { parseISO, differenceInCalendarDays } from 'date-fns'
import { semanaUtilCorrente, resolverPeriodo } from '@/lib/relatorios/periodo'

describe('semanaUtilCorrente', () => {
  it('devolve segunda→sexta da semana que contém a data', () => {
    const p = semanaUtilCorrente('2026-07-15') // quarta-feira
    // de = segunda-feira
    expect(parseISO(p.de).getDay()).toBe(1)
    // intervalo de exatamente 4 dias (seg..sex)
    expect(differenceInCalendarDays(parseISO(p.ate), parseISO(p.de))).toBe(4)
    expect(p.de <= '2026-07-15').toBe(true)
    expect('2026-07-15' <= p.ate).toBe(true)
  })
})

describe('preset "semana" — semana corrente domingo→sábado (B2/F6B)', () => {
  // de = domingo da semana corrente; ate = hoje (sempre dentro da semana).
  it('quarta-feira comum: domingo anterior → hoje', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2026-07-15') // quarta
    expect(r).toMatchObject({ de: '2026-07-12', ate: '2026-07-15', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0) // domingo
    expect(r.rotulo).toBe('Esta semana')
  })

  it('domingo: de = ate = o próprio domingo', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2026-07-12') // domingo
    expect(r).toMatchObject({ de: '2026-07-12', ate: '2026-07-12', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0)
  })

  it('sábado: domingo da mesma semana → sábado (semana inteira)', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2026-07-18') // sábado
    expect(r).toMatchObject({ de: '2026-07-12', ate: '2026-07-18', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0)
    expect(differenceInCalendarDays(parseISO(r.ate), parseISO(r.de))).toBe(6)
  })

  it('virada de mês: domingo em julho, hoje em agosto', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2026-08-01') // sábado
    expect(r).toMatchObject({ de: '2026-07-26', ate: '2026-08-01', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0)
  })

  it('virada de ano: domingo em dez/2026, hoje em jan/2027', () => {
    const r = resolverPeriodo({ preset: 'semana' }, '2027-01-01') // sexta
    expect(r).toMatchObject({ de: '2026-12-27', ate: '2027-01-01', preset: 'semana' })
    expect(parseISO(r.de).getDay()).toBe(0)
  })
})

describe('resolverPeriodo', () => {
  const hoje = '2026-07-14' // terça-feira

  it('aceita período custom válido (de <= ate)', () => {
    const r = resolverPeriodo({ de: '2026-01-01', ate: '2026-06-30' }, hoje)
    expect(r).toMatchObject({
      de: '2026-01-01',
      ate: '2026-06-30',
      preset: 'custom',
      rotulo: 'Período personalizado',
    })
  })

  it('descarta custom inválido (de > ate) e cai no preset padrão (semana)', () => {
    const r = resolverPeriodo({ de: '2026-06-30', ate: '2026-01-01' }, hoje)
    expect(r.preset).toBe('semana')
  })

  it('descarta custom com data mal-formada e cai no padrão (semana)', () => {
    const r = resolverPeriodo({ de: '30/06/2026', ate: '2026-07-01' }, hoje)
    expect(r.preset).toBe('semana')
  })

  it('resolve preset "30dias" (inclusive, 30 dias contando hoje)', () => {
    const r = resolverPeriodo({ preset: '30dias' }, hoje)
    expect(r).toMatchObject({ de: '2026-06-15', ate: hoje, preset: '30dias' })
  })

  it('resolve preset "ano" a partir de 1º de janeiro', () => {
    const r = resolverPeriodo({ preset: 'ano' }, hoje)
    expect(r).toMatchObject({ de: '2026-01-01', ate: hoje, preset: 'ano' })
  })

  it('resolve preset "tudo" com teto inferior seguro', () => {
    const r = resolverPeriodo({ preset: 'tudo' }, hoje)
    expect(r).toMatchObject({ de: '2000-01-01', ate: hoje, preset: 'tudo' })
  })

  it('cai no padrão (semana) para preset desconhecido ou ausente', () => {
    expect(resolverPeriodo({ preset: 'xyz' }, hoje).preset).toBe('semana')
    const r = resolverPeriodo({}, hoje)
    expect(r).toMatchObject({ de: '2026-07-12', ate: hoje, preset: 'semana' })
  })

  it('URLs explícitas com preset antigo continuam funcionando (?preset=ano)', () => {
    expect(resolverPeriodo({ preset: 'ano' }, hoje).preset).toBe('ano')
    expect(resolverPeriodo({ preset: 'tudo' }, hoje).preset).toBe('tudo')
  })
})
