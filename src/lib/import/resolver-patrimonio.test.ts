import { describe, it, expect } from 'vitest'
import { resolverPatrimonio } from '@/lib/import/resolver-patrimonio'
import { patrimonioVazio } from '@/lib/import/deparas'

// Chama a escada como o motor faz: `eraVazio` = patrimonioVazio(cru).
const r = (cru: string, hostname: string | null = null, forcado = false) =>
  resolverPatrimonio(cru, patrimonioVazio(cru), hostname, forcado)

describe('resolverPatrimonio — escada de precedência (dívida técnica, item F)', () => {
  it('(1) célula canônica → usa, sem aviso/bloqueante', () => {
    expect(r('WAP4491')).toEqual({ patrimonio: 'WAP0004491' })
  })

  it('(1) célula canônica VENCE o hostname (nunca é sobrescrita)', () => {
    expect(r('WAP4491', 'NB-PRO0009999')).toEqual({ patrimonio: 'WAP0004491' })
  })

  it('(2) forçado fora de formato (≤60) → aceita o cru trimado', () => {
    expect(r('LEA7LYHQH4', null, true)).toEqual({ patrimonio: 'LEA7LYHQH4' })
    expect(r('  STF003LOC  ', null, true)).toEqual({ patrimonio: 'STF003LOC' })
  })

  it('(2) forçado VENCE o hostname', () => {
    expect(r('LEA7LYHQH4', 'NB-WAP0001234', true)).toEqual({ patrimonio: 'LEA7LYHQH4' })
  })

  it('(2) forçado > 60 caracteres → bloqueante "longo demais"', () => {
    const longo = 'L'.repeat(61)
    const res = r(longo, null, true)
    expect('bloqueante' in res).toBe(true)
    if ('bloqueante' in res) {
      expect(res.bloqueante.tipo).toBe('patrimonio_invalido')
      expect(res.bloqueante.mensagem).toContain('longo demais para forçar')
      expect(res.bloqueante.mensagem).toContain('61')
    }
  })

  it('(3) VAZIO com hostname canônico → auto-preenche (aviso patrimonio_do_hostname, "ausente")', () => {
    const res = r('', 'NB-WAP0001234')
    expect(res).toMatchObject({ patrimonio: 'WAP0001234' })
    if ('aviso' in res && res.aviso) {
      expect(res.aviso.tipo).toBe('patrimonio_do_hostname')
      expect(res.aviso.mensagem).toContain('ausente')
      expect(res.aviso.mensagem).toContain('WAP0001234')
    } else {
      throw new Error('esperava aviso patrimonio_do_hostname')
    }
  })

  it('(3) FORA DE FORMATO (não forçado) com hostname → substitui (aviso, "fora do formato")', () => {
    const res = r('12345', 'NB-STF0000123')
    expect(res).toMatchObject({ patrimonio: 'STF0000123' })
    if ('aviso' in res && res.aviso) {
      expect(res.aviso.tipo).toBe('patrimonio_do_hostname')
      expect(res.aviso.mensagem).toContain('fora do formato')
      expect(res.aviso.mensagem).toContain('12345')
    } else {
      throw new Error('esperava aviso patrimonio_do_hostname')
    }
  })

  it('(4) declara ausência, sem hostname → NULO + pendência (aviso patrimonio_vazio)', () => {
    const res = r('')
    expect(res).toMatchObject({ patrimonio: null })
    if ('aviso' in res && res.aviso) {
      expect(res.aviso.tipo).toBe('patrimonio_vazio')
      expect(res.aviso.mensagem).toContain('sem patrimônio físico')
    } else {
      throw new Error('esperava aviso patrimonio_vazio')
    }
  })

  it('(5) fora de formato, sem hostname, não forçado → bloqueante "fora do formato canônico"', () => {
    const res = r('12345')
    expect('bloqueante' in res).toBe(true)
    if ('bloqueante' in res) {
      expect(res.bloqueante.tipo).toBe('patrimonio_invalido')
      expect(res.bloqueante.mensagem).toContain('fora do formato canônico')
      expect(res.bloqueante.mensagem).toContain('12345')
    }
  })
})
