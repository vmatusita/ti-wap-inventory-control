import { describe, expect, it } from 'vitest'
import { montarItensJuntoDoLote } from '@/components/movimentacoes/nova/itens-do-lote'
import { configPadrao, type Config } from '@/components/movimentacoes/nova/config'
import { contrapartidaPadrao } from '@/components/movimentacoes/nova/troca-upgrade'

function cfg(over: Partial<Config>): Config {
  return { ...configPadrao(), ...over }
}

describe('montarItensJuntoDoLote — entrega (a seção "Itens que vão junto")', () => {
  it('leva as linhas com o índice que o operador escolheu (D13)', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({
        tipo: 'saida',
        itensJunto: [
          { indice: 0, itemId: 3, quantidade: 1 },
          { indice: 1, itemId: 7, quantidade: 2 },
        ],
      }),
      totalPrincipal: 2,
    })
    expect(r).toEqual([
      { indice: 0, item_id: 3, quantidade: 1 },
      { indice: 1, item_id: 7, quantidade: 2 },
    ])
  })

  it('empréstimo carrega item igual à saída', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({ tipo: 'emprestimo', itensJunto: [{ indice: 0, itemId: 3, quantidade: 1 }] }),
      totalPrincipal: 1,
    })
    expect(r).toHaveLength(1)
  })

  it('índice ÓRFÃO (o lote encolheu) não vira linha — nunca derruba o lote', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({
        tipo: 'saida',
        itensJunto: [
          { indice: 0, itemId: 3, quantidade: 1 },
          { indice: 5, itemId: 9, quantidade: 1 },
        ],
      }),
      totalPrincipal: 2,
    })
    expect(r).toEqual([{ indice: 0, item_id: 3, quantidade: 1 }])
  })

  it('quantidade zero ou item inválido não vira linha', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({
        tipo: 'saida',
        itensJunto: [
          { indice: 0, itemId: 0, quantidade: 1 },
          { indice: 0, itemId: 3, quantidade: 0 },
        ],
      }),
      totalPrincipal: 1,
    })
    expect(r).toEqual([])
  })

  it('tipo que não é entrega ignora a seção inteira', () => {
    for (const tipo of ['transferencia', 'ajuste', 'compra'] as const) {
      const r = montarItensJuntoDoLote({
        config: cfg({ tipo, itensJunto: [{ indice: 0, itemId: 3, quantidade: 1 }] }),
        totalPrincipal: 1,
      })
      expect(r, tipo).toEqual([])
    }
  })

  it('lote vazio não produz linha nenhuma', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({ tipo: 'saida', itensJunto: [{ indice: 0, itemId: 3, quantidade: 1 }] }),
      totalPrincipal: 0,
    })
    expect(r).toEqual([])
  })
})

describe('montarItensJuntoDoLote — devolução (o checklist de dois desfechos)', () => {
  it('cada tipo "Voltou" que resolveu item vira UMA linha de quantidade 1', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({
        tipo: 'devolucao',
        itensDevolvidos: [
          { tipoSlug: 'cabo', itemId: 4 },
          { tipoSlug: 'mochila', itemId: 5 },
        ],
      }),
      totalPrincipal: 3,
    })
    expect(r).toEqual([
      { indice: 0, item_id: 4, quantidade: 1 },
      { indice: 0, item_id: 5, quantidade: 1 },
    ])
  })

  it('tipo que NÃO resolveu item não vira linha — e isso não é erro', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({
        tipo: 'devolucao',
        itensDevolvidos: [
          { tipoSlug: 'fone', itemId: null },
          { tipoSlug: 'cabo', itemId: 4 },
        ],
      }),
      totalPrincipal: 1,
    })
    expect(r).toEqual([{ indice: 0, item_id: 4, quantidade: 1 }])
  })

  it('checklist vazio não produz linha nenhuma — o fluxo de hoje segue idêntico', () => {
    expect(
      montarItensJuntoDoLote({ config: cfg({ tipo: 'devolucao' }), totalPrincipal: 2 }),
    ).toEqual([])
  })

  it('o "Faltante" não passa por aqui: só quem voltou vira lançamento', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({ tipo: 'devolucao', itensFaltantes: ['cabo', 'mochila'] }),
      totalPrincipal: 1,
    })
    expect(r).toEqual([])
  })
})

describe('montarItensJuntoDoLote — o par troca/upgrade e o deslocamento do índice', () => {
  it('o checklist da contrapartida aponta a PRIMEIRA movimentação DELA', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({ tipo: 'saida', itensJunto: [{ indice: 0, itemId: 3, quantidade: 1 }] }),
      totalPrincipal: 2,
      contrapartida: contrapartidaPadrao({ itensDevolvidos: [{ tipoSlug: 'cabo', itemId: 8 }] }),
      totalContrapartida: 1,
    })
    expect(r).toEqual([
      { indice: 0, item_id: 3, quantidade: 1 },
      // deslocado pelos 2 ativos da metade principal
      { indice: 2, item_id: 8, quantidade: 1 },
    ])
  })

  it('contrapartida sem ativo submetido não gera linha, mesmo com checklist marcado', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({ tipo: 'saida' }),
      totalPrincipal: 1,
      contrapartida: contrapartidaPadrao({ itensDevolvidos: [{ tipoSlug: 'cabo', itemId: 8 }] }),
      totalContrapartida: 0,
    })
    expect(r).toEqual([])
  })

  it('no sentido devolução→saída a contrapartida não coleta item', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({ tipo: 'devolucao', itensDevolvidos: [{ tipoSlug: 'cabo', itemId: 4 }] }),
      totalPrincipal: 1,
      contrapartida: contrapartidaPadrao({ itensDevolvidos: [{ tipoSlug: 'mochila', itemId: 9 }] }),
      totalContrapartida: 1,
    })
    expect(r).toEqual([{ indice: 0, item_id: 4, quantidade: 1 }])
  })
})
