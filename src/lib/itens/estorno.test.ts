import { describe, expect, it } from 'vitest'
import { planejarEstorno } from '@/lib/itens/estorno'

describe('planejarEstorno (semântica Total/Estoque F6A)', () => {
  it('entrada → ajuste negativo (baixa o total) com observação automática', () => {
    const p = planejarEstorno({ tipo: 'entrada', quantidade: 10, chamado: null, observacao: null })
    expect(p.tipo).toBe('ajuste')
    expect(p.quantidade).toBe(-10)
    expect(p.chamado).toBeNull()
    expect(p.observacao).toContain('Estorno de entrada')
  })
  it('saida (liberação) → retorno mantendo o chamado', () => {
    const p = planejarEstorno({ tipo: 'saida', quantidade: 3, chamado: '111', observacao: null })
    expect(p.tipo).toBe('retorno')
    expect(p.quantidade).toBe(3)
    expect(p.chamado).toBe('111')
    expect(p.observacao).toBeNull()
  })
  it('retorno → saida', () => {
    const p = planejarEstorno({ tipo: 'retorno', quantidade: 1, chamado: null, observacao: null })
    expect(p.tipo).toBe('saida')
    expect(p.quantidade).toBe(1)
  })
  it('reserva (atrelar) → liberacao (devolução) com chamado', () => {
    const p = planejarEstorno({ tipo: 'reserva', quantidade: 2, chamado: '222', observacao: null })
    expect(p.tipo).toBe('liberacao')
    expect(p.chamado).toBe('222')
  })
  it('liberacao (devolução) → reserva com chamado', () => {
    const p = planejarEstorno({ tipo: 'liberacao', quantidade: 1, chamado: '222', observacao: null })
    expect(p.tipo).toBe('reserva')
    expect(p.chamado).toBe('222')
  })
  it('ajuste → ajuste com sinal invertido e observação preservada', () => {
    const p = planejarEstorno({ tipo: 'ajuste', quantidade: -2, chamado: null, observacao: 'perda' })
    expect(p.tipo).toBe('ajuste')
    expect(p.quantidade).toBe(2)
    expect(p.observacao).toContain('perda')
  })
})
