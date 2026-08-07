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

// ---------------------------------------------------------------------------
// ITN-05c — motivo (opcional) do estorno
// ---------------------------------------------------------------------------

describe('planejarEstorno com motivo (ITN-05c)', () => {
  it('sem motivo, o comportamento de hoje não muda (ajuste/entrada com observação automática, os demais sem)', () => {
    const semMotivoAjuste = planejarEstorno({
      tipo: 'ajuste',
      quantidade: -2,
      chamado: null,
      observacao: 'perda',
    })
    expect(semMotivoAjuste.observacao).toBe('Estorno de ajuste (perda)')

    const semMotivoSaida = planejarEstorno({
      tipo: 'saida',
      quantidade: 3,
      chamado: '111',
      observacao: null,
    })
    expect(semMotivoSaida.observacao).toBeNull()
  })

  it('tipo que ANTES não tinha observação (saida/retorno/reserva/liberacao) ganha SÓ o motivo', () => {
    const p = planejarEstorno(
      { tipo: 'saida', quantidade: 3, chamado: '111', observacao: null },
      'peça devolvida errada',
    )
    expect(p.observacao).toBe('Estorno: peça devolvida errada')
  })

  it('ajuste/entrada PRESERVAM o texto automático e ACRESCENTAM o motivo (não substituem)', () => {
    const ajuste = planejarEstorno(
      { tipo: 'ajuste', quantidade: -2, chamado: null, observacao: 'perda' },
      'contagem repetida',
    )
    expect(ajuste.observacao).toBe('Estorno de ajuste (perda) — Estorno: contagem repetida')

    const entrada = planejarEstorno(
      { tipo: 'entrada', quantidade: 10, chamado: null, observacao: null },
      'NF cancelada',
    )
    expect(entrada.observacao).toBe(
      'Estorno de entrada (baixa de 10 do total) — Estorno: NF cancelada',
    )
  })

  it('motivo em branco (só espaços) é tratado como ausente', () => {
    const p = planejarEstorno(
      { tipo: 'retorno', quantidade: 1, chamado: null, observacao: null },
      '   ',
    )
    expect(p.observacao).toBeNull()
  })

  it('motivo undefined ou null equivalem a "sem motivo"', () => {
    const base = { tipo: 'liberacao' as const, quantidade: 2, chamado: '222', observacao: null }
    expect(planejarEstorno(base).observacao).toBeNull()
    expect(planejarEstorno(base, undefined).observacao).toBeNull()
    expect(planejarEstorno(base, null).observacao).toBeNull()
  })
})
