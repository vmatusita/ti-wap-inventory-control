import { describe, expect, it } from 'vitest'
import {
  aplicarSinal,
  moduloDeQuantidade,
  sentidoDeQuantidade,
} from '@/lib/itens/sinal-ajuste'

describe('moduloDeQuantidade', () => {
  it('remove o sinal de abertura', () => {
    expect(moduloDeQuantidade('-3')).toBe('3')
    expect(moduloDeQuantidade('3')).toBe('3')
  })

  it('vazio continua vazio', () => {
    expect(moduloDeQuantidade('')).toBe('')
    expect(moduloDeQuantidade('  ')).toBe('')
  })
})

describe('sentidoDeQuantidade', () => {
  it('quantidade vazia ou positiva é "positivo" (padrão da linha nova)', () => {
    expect(sentidoDeQuantidade('')).toBe('positivo')
    expect(sentidoDeQuantidade('3')).toBe('positivo')
  })

  it('quantidade com "-" na frente é "negativo"', () => {
    expect(sentidoDeQuantidade('-3')).toBe('negativo')
  })
})

describe('aplicarSinal', () => {
  it('positivo devolve o módulo sem sinal', () => {
    expect(aplicarSinal('3', 'positivo')).toBe('3')
  })

  it('negativo antepõe o "-"', () => {
    expect(aplicarSinal('3', 'negativo')).toBe('-3')
  })

  it('módulo vazio continua vazio nos dois sentidos', () => {
    expect(aplicarSinal('', 'positivo')).toBe('')
    expect(aplicarSinal('', 'negativo')).toBe('')
  })

  it('zero nunca ganha sinal', () => {
    expect(aplicarSinal('0', 'negativo')).toBe('0')
    expect(aplicarSinal('0', 'positivo')).toBe('0')
  })

  it('valor já negativo colado pelo operador é tratado pelo módulo — o sinal final é sempre o do alternador', () => {
    expect(aplicarSinal('-5', 'positivo')).toBe('5')
    expect(aplicarSinal('-5', 'negativo')).toBe('-5')
  })
})
