import { describe, expect, it } from 'vitest'
import { carimboAtualizado } from './carimbo-hora'

// Instantes construídos em UTC deslocando +3h do horário-alvo em São Paulo
// (fuso fixo, UTC-3, sem horário de verão desde 2019 — mesma premissa de
// `src/lib/format.test.ts`): é o que `carimboAtualizado` deve devolver, já
// que reusa `formatTime` (fuso de SP) por decisão registrada no comentário
// da função.
describe('carimboAtualizado', () => {
  it('meia-noite em SP', () => {
    const instante = Date.UTC(2026, 7, 10, 3, 0) // 2026-08-10T03:00Z = 00:00 SP
    expect(carimboAtualizado(instante)).toBe('atualizado às 00:00')
  })

  it('meio-dia em SP', () => {
    const instante = Date.UTC(2026, 7, 10, 15, 0) // 12:00 SP
    expect(carimboAtualizado(instante)).toBe('atualizado às 12:00')
  })

  it('horário qualquer com zero à esquerda em hora e minuto', () => {
    const instante = Date.UTC(2026, 7, 10, 12, 5) // 09:05 SP
    expect(carimboAtualizado(instante)).toBe('atualizado às 09:05')
  })

  it('formato exato: prefixo fixo, 24h, dois dígitos — nunca AM/PM nem hora >23', () => {
    const instante = Date.UTC(2026, 7, 11, 2, 47) // 23:47 SP (vira o dia em UTC)
    const resultado = carimboAtualizado(instante)
    expect(resultado).toBe('atualizado às 23:47')
    expect(resultado).toMatch(/^atualizado às ([01]\d|2[0-3]):[0-5]\d$/)
  })

  it('aceita Date além de number (mesmo instante, mesmo resultado)', () => {
    const instante = Date.UTC(2026, 7, 10, 15, 0)
    expect(carimboAtualizado(new Date(instante))).toBe(carimboAtualizado(instante))
    expect(carimboAtualizado(new Date(instante))).toBe('atualizado às 12:00')
  })

  it('entrada inválida (Date NaN) devolve string vazia — o componente não renderiza nada', () => {
    expect(carimboAtualizado(new Date('nao-e-data'))).toBe('')
  })

  it('entrada inválida (number NaN) devolve string vazia', () => {
    expect(carimboAtualizado(NaN)).toBe('')
  })
})
