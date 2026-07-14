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

describe('resolverPeriodo', () => {
  const hoje = '2026-07-14'

  it('aceita período custom válido (de <= ate)', () => {
    const r = resolverPeriodo({ de: '2026-01-01', ate: '2026-06-30' }, hoje)
    expect(r).toMatchObject({
      de: '2026-01-01',
      ate: '2026-06-30',
      preset: 'custom',
      rotulo: 'Período personalizado',
    })
  })

  it('descarta custom inválido (de > ate) e cai no preset padrão (ano)', () => {
    const r = resolverPeriodo({ de: '2026-06-30', ate: '2026-01-01' }, hoje)
    expect(r.preset).toBe('ano')
  })

  it('descarta custom com data mal-formada', () => {
    const r = resolverPeriodo({ de: '30/06/2026', ate: '2026-07-01' }, hoje)
    expect(r.preset).toBe('ano')
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

  it('cai no padrão (ano) para preset desconhecido ou ausente', () => {
    expect(resolverPeriodo({ preset: 'xyz' }, hoje).preset).toBe('ano')
    expect(resolverPeriodo({}, hoje).preset).toBe('ano')
  })
})
