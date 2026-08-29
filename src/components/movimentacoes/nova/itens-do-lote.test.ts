import { describe, expect, it } from 'vitest'
import {
  MSG_LOTE_MISTO_SEM_LANCAMENTO,
  checklistPodeLancar,
  montarItensJuntoDoLote,
  reindexarItensJunto,
} from '@/components/movimentacoes/nova/itens-do-lote'
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

describe('checklistPodeLancar — o lote misto não mexe no estoque', () => {
  const A = { filial_id: 1, colaborador_atual: 'Fulano' }
  const B = { filial_id: 1, colaborador_atual: 'Beatriz' }
  const C = { filial_id: 2, colaborador_atual: 'Fulano' }

  it('lote de UM ativo é homogêneo por definição', () => {
    expect(checklistPodeLancar([A])).toBe(true)
  })

  it('lote ausente ou vazio não bloqueia (é o caminho de quem não passa o lote)', () => {
    expect(checklistPodeLancar()).toBe(true)
    expect(checklistPodeLancar([])).toBe(true)
  })

  it('mesma filial E mesma pessoa: pode lançar', () => {
    expect(checklistPodeLancar([A, { ...A }])).toBe(true)
  })

  it('DETENTORES diferentes: NÃO lança — o fone do Fulano baixaria da conta da Beatriz', () => {
    expect(checklistPodeLancar([A, B])).toBe(false)
  })

  it('FILIAIS diferentes: NÃO lança — o acessório voltaria para a prateleira errada', () => {
    expect(checklistPodeLancar([A, C])).toBe(false)
  })

  it('ativos sem detentor nenhum ainda são homogêneos entre si', () => {
    expect(
      checklistPodeLancar([
        { filial_id: 1, colaborador_atual: null },
        { filial_id: 1, colaborador_atual: '  ' },
      ]),
    ).toBe(true)
  })
})

describe('montarItensJuntoDoLote — o lote misto desliga o checklist', () => {
  const marcado = { tipo: 'devolucao' as const, itensDevolvidos: [{ tipoSlug: 'cabo', itemId: 4 }] }

  it('lote homogêneo continua gerando a linha', () => {
    const r = montarItensJuntoDoLote({
      config: cfg(marcado),
      totalPrincipal: 2,
      lotePrincipal: [
        { filial_id: 1, colaborador_atual: 'Fulano' },
        { filial_id: 1, colaborador_atual: 'Fulano' },
      ],
    })
    expect(r).toEqual([{ indice: 0, item_id: 4, quantidade: 1 }])
  })

  it('detentores diferentes: NENHUMA linha, e a devolução segue', () => {
    const r = montarItensJuntoDoLote({
      config: cfg(marcado),
      totalPrincipal: 2,
      lotePrincipal: [
        { filial_id: 1, colaborador_atual: 'Fulano' },
        { filial_id: 1, colaborador_atual: 'Beatriz' },
      ],
    })
    expect(r).toEqual([])
  })

  it('filiais diferentes: NENHUMA linha', () => {
    const r = montarItensJuntoDoLote({
      config: cfg(marcado),
      totalPrincipal: 2,
      lotePrincipal: [
        { filial_id: 1, colaborador_atual: 'Fulano' },
        { filial_id: 2, colaborador_atual: 'Fulano' },
      ],
    })
    expect(r).toEqual([])
  })

  it('a ENTREGA não é afetada pela regra — lá cada linha escolhe seu equipamento', () => {
    const r = montarItensJuntoDoLote({
      config: cfg({ tipo: 'saida', itensJunto: [{ indice: 1, itemId: 3, quantidade: 1 }] }),
      totalPrincipal: 2,
      lotePrincipal: [
        { filial_id: 1, colaborador_atual: 'Fulano' },
        { filial_id: 2, colaborador_atual: 'Beatriz' },
      ],
    })
    expect(r).toEqual([{ indice: 1, item_id: 3, quantidade: 1 }])
  })

  it('o aviso da tela existe e explica o efeito, não o mecanismo', () => {
    expect(MSG_LOTE_MISTO_SEM_LANCAMENTO).toContain('não mexe no estoque')
    expect(MSG_LOTE_MISTO_SEM_LANCAMENTO).toContain('lotes separados')
  })
})

// ---------------------------------------------------------------------------
// reindexarItensJunto — o índice posicional sobrevive a um lote remontado
// ---------------------------------------------------------------------------
describe('reindexarItensJunto', () => {
  const A = 'aaaaaaaa-0000-4000-8000-000000000001'
  const B = 'bbbbbbbb-0000-4000-8000-000000000002'
  const C = 'cccccccc-0000-4000-8000-000000000003'
  const linha = (indice: number, itemId = 7) => ({ indice, itemId, quantidade: 1 })

  it('lista vazia devolve lista vazia', () => {
    expect(reindexarItensJunto([], [A, B], [A, B])).toEqual([])
  })

  it('lote inteiro de volta: os índices não mudam', () => {
    expect(reindexarItensJunto([linha(0), linha(2)], [A, B, C], [A, B, C])).toEqual([
      linha(0),
      linha(2),
    ])
  })

  it('o ativo do MEIO não voltou: quem vinha depois desloca para trás', () => {
    // O fone acompanhava o C (posição 2); sem o B, o C passa a ser a posição 1.
    expect(reindexarItensJunto([linha(2)], [A, B, C], [A, C])).toEqual([linha(1)])
  })

  it('o ativo da linha não voltou: a linha some junto com ele', () => {
    expect(reindexarItensJunto([linha(1)], [A, B, C], [A, C])).toEqual([])
  })

  it('índice fora dos ids originais não vira lançamento (rascunho corrompido)', () => {
    expect(reindexarItensJunto([linha(9)], [A, B], [A, B])).toEqual([])
  })

  it('preserva item e quantidade de cada linha', () => {
    const r = reindexarItensJunto(
      [{ indice: 1, itemId: 42, quantidade: 3 }],
      [A, B],
      [B],
    )
    expect(r).toEqual([{ indice: 0, itemId: 42, quantidade: 3 }])
  })

  it('lote inteiro perdido devolve lista vazia, nunca índice inválido', () => {
    expect(reindexarItensJunto([linha(0), linha(1)], [A, B], [])).toEqual([])
  })
})
