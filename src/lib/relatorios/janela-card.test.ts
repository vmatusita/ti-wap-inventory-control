import { describe, expect, it } from 'vitest'
import { textoJanela } from './janela-card'

describe('textoJanela — foto (as-of): só a data de FIM importa', () => {
  it('formata "foto de dd/MM" a partir de `ate`, ignorando `de`', () => {
    expect(textoJanela('foto', { de: '2026-08-01', ate: '2026-08-10' })).toBe('foto de 10/08')
  })

  it('vira o mês: `ate` no mês seguinte a `de` não confunde o dia/mês', () => {
    expect(textoJanela('foto', { de: '2026-07-25', ate: '2026-08-01' })).toBe('foto de 01/08')
  })

  it('período de um dia só (de === ate)', () => {
    expect(textoJanela('foto', { de: '2026-08-10', ate: '2026-08-10' })).toBe('foto de 10/08')
  })

  it('`de` malformado não afeta foto — só `ate` é lido', () => {
    expect(textoJanela('foto', { de: 'lixo', ate: '2026-08-10' })).toBe('foto de 10/08')
  })
})

describe('textoJanela — periodo (filme): dd/MM – dd/MM com en dash', () => {
  it('formata "dd/MM – dd/MM"', () => {
    expect(textoJanela('periodo', { de: '2026-08-01', ate: '2026-08-10' })).toBe('01/08 – 10/08')
  })

  it('vira o mês nos dois lados', () => {
    expect(textoJanela('periodo', { de: '2026-07-25', ate: '2026-08-01' })).toBe('25/07 – 01/08')
  })

  it('período de um dia só repete a mesma data dos dois lados', () => {
    expect(textoJanela('periodo', { de: '2026-08-10', ate: '2026-08-10' })).toBe('10/08 – 10/08')
  })

  it('usa o travessão "–" (en dash) com espaço dos dois lados, não o hífen "-"', () => {
    const texto = textoJanela('periodo', { de: '2026-08-01', ate: '2026-08-10' })
    expect(texto).toContain(' – ')
    expect(texto).not.toContain(' - ')
  })
})

describe('textoJanela — ISO malformado ou período incompleto devolve string vazia', () => {
  it('`ate` fora do formato yyyy-MM-dd derruba o chip de foto', () => {
    expect(textoJanela('foto', { de: '2026-08-01', ate: '10/08/2026' })).toBe('')
    expect(textoJanela('foto', { de: '2026-08-01', ate: '' })).toBe('')
    expect(textoJanela('foto', { de: '2026-08-01', ate: 'não é data' })).toBe('')
  })

  it('timestamptz completo (com hora/Z) não bate o formato de data pura — tratado como malformado', () => {
    expect(textoJanela('foto', { de: '2026-08-01', ate: '2026-08-10T00:00:00Z' })).toBe('')
  })

  it('data sem zero à esquerda (2026-8-1) não bate o formato fixo de 4-2-2 dígitos', () => {
    expect(textoJanela('periodo', { de: '2026-8-1', ate: '2026-08-10' })).toBe('')
  })

  it('qualquer um dos dois lados malformado derruba o chip inteiro de periodo', () => {
    expect(textoJanela('periodo', { de: '2026-08-01', ate: '' })).toBe('')
    expect(textoJanela('periodo', { de: '', ate: '2026-08-10' })).toBe('')
  })

  it('shape-only (mesma política de DATA_PURA_RE em format.ts): dia fora do calendário passa como texto, não é validação de calendário', () => {
    expect(textoJanela('periodo', { de: '2026-08-01', ate: '2026-08-32' })).toBe('01/08 – 32/08')
  })
})
