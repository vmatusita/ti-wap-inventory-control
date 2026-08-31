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

// ---------------------------------------------------------------------------
// F41 — o inverso do ACERTO AUTOMÁTICO (critério 5 da fase)
// ---------------------------------------------------------------------------
// A `estornar_movimentacao_com_itens` (0121) confere, antes de devolver, que NENHUM
// lançamento da movimentação ficou sem estorno — e recusa a transação inteira se
// ficou. Como a F41 passou a gravar um `ajuste` a MAIS (o acerto automático) preso
// à movimentação, é aqui que se prova que ele é planejado como os outros: se
// `planejarEstorno` o ignorasse, o estorno passaria a falhar em toda movimentação
// que tivesse regularizado.
describe('planejarEstorno do acerto automático (F41)', () => {
  const acerto = {
    tipo: 'ajuste' as const,
    quantidade: 1,
    chamado: null,
    observacao: 'Acerto automático: 1 unidade de Carregador entrou no acervo…',
    regularizacao: true,
  }

  it('inverte o sinal, como qualquer ajuste — é isso que desfaz o acerto', () => {
    const p = planejarEstorno(acerto)
    expect(p.tipo).toBe('ajuste')
    expect(p.quantidade).toBe(-1)
  })

  it('o texto diz que o acerto era AUTOMÁTICO (senão o diário culpa o operador)', () => {
    const p = planejarEstorno(acerto)
    expect(p.observacao).toContain('Estorno do acerto automático')
    // A justificativa original é PRESERVADA dentro dos parênteses: sem ela, quem lê
    // o estorno não descobre o que estava sendo acertado.
    expect(p.observacao).toContain('Carregador')
  })

  it('ajuste COMUM continua com o texto de sempre (a marca é o que distingue)', () => {
    const p = planejarEstorno({ ...acerto, regularizacao: false })
    expect(p.observacao).toContain('Estorno de ajuste')
    expect(p.observacao).not.toContain('acerto automático')
  })

  it('marca ausente ou nula é tratada como ajuste comum', () => {
    for (const marca of [undefined, null]) {
      const p = planejarEstorno({ ...acerto, regularizacao: marca })
      expect(p.observacao).toContain('Estorno de ajuste')
    }
  })

  it('o motivo digitado pelo operador entra SEM apagar o texto automático', () => {
    const p = planejarEstorno(acerto, 'devolução lançada em duplicidade')
    expect(p.observacao).toContain('Estorno do acerto automático')
    expect(p.observacao).toContain('Estorno: devolução lançada em duplicidade')
  })

  it('o par acerto + devolução se desfaz inteiro (o cenário do critério 5)', () => {
    // A movimentação gravou `ajuste +1` (acerto) e `retorno 1`. O estorno tem de
    // planejar DOIS inversos — é a conferência interna da 0121 que cobra isso.
    const inversos = [
      acerto,
      { tipo: 'retorno' as const, quantidade: 1, chamado: null, observacao: null },
    ].map((l) => planejarEstorno(l))
    expect(inversos.map((i) => i.tipo)).toEqual(['ajuste', 'saida'])
    expect(inversos.map((i) => i.quantidade)).toEqual([-1, 1])
  })
})
