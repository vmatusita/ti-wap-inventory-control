import { describe, it, expect } from 'vitest'
import {
  partirQuantidade,
  textoDaRegularizacao,
  avisoDeRegularizacao,
  PREFIXO_REGULARIZACAO,
} from '@/lib/itens/regularizacao'

// A aritmética da F41, caso a caso. Os três exemplos numerados do §4.2 do
// docs/PLANO-ITENS.md estão aqui como cenário fechado — não porque a conta seja
// difícil, mas porque é ELA que decide se o lote grava ou morre, e um sinal trocado
// aqui reabre o bug do print sem derrubar teste nenhum.

describe('partirQuantidade — a devolução (retorno)', () => {
  it('sem saída em aberto, é UMA linha só: tudo vira acerto (o caso do print)', () => {
    expect(partirQuantidade('retorno', 1, { emUso: 0, emEstoque: 5 })).toEqual({
      normal: 0,
      regularizacao: 1,
    })
  })

  it('com saída em aberto de sobra, não regulariza nada', () => {
    expect(partirQuantidade('retorno', 1, { emUso: 3, emEstoque: 0 })).toEqual({
      normal: 1,
      regularizacao: 0,
    })
  })

  it('2 unidades contra 1 saída em aberto → retorno 1 + acerto 1 (§4.2, 2º exemplo)', () => {
    expect(partirQuantidade('retorno', 2, { emUso: 1, emEstoque: 3 })).toEqual({
      normal: 1,
      regularizacao: 1,
    })
  })

  it('exatamente o que está em aberto → retorno inteiro, acerto zero', () => {
    expect(partirQuantidade('retorno', 4, { emUso: 4, emEstoque: 0 })).toEqual({
      normal: 4,
      regularizacao: 0,
    })
  })

  it('"em uso" negativo não vira crédito: o piso é zero, como o greatest(0,…) do SQL', () => {
    // Histórico com mais devolução que saída (import antigo, estorno) deixava
    // `Σsaida − Σretorno` negativo. Sem o piso, `mín(q, −2)` daria retorno negativo
    // e o CHECK `lanc_item_qtd_valida` recusaria a linha.
    expect(partirQuantidade('retorno', 2, { emUso: -2, emEstoque: 9 })).toEqual({
      normal: 0,
      regularizacao: 2,
    })
  })

  it('a soma das duas partes é SEMPRE a quantidade pedida', () => {
    for (const q of [1, 2, 3, 7, 30]) {
      for (const emUso of [-3, 0, 1, 2, 5, 100]) {
        const p = partirQuantidade('retorno', q, { emUso, emEstoque: 0 })
        expect(p.normal + p.regularizacao, `q=${q} A=${emUso}`).toBe(q)
        expect(p.normal).toBeGreaterThanOrEqual(0)
        expect(p.regularizacao).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('partirQuantidade — a entrega (saida)', () => {
  it('sem estoque na filial, a saída sai INTEIRA e o acerto repõe o que faltava (§4.2, 3º exemplo)', () => {
    expect(partirQuantidade('saida', 1, { emUso: 0, emEstoque: 0 })).toEqual({
      normal: 1,
      regularizacao: 1,
    })
  })

  it('com estoque de sobra, não regulariza nada', () => {
    expect(partirQuantidade('saida', 2, { emUso: 0, emEstoque: 9 })).toEqual({
      normal: 2,
      regularizacao: 0,
    })
  })

  it('estoque parcial: o acerto cobre só a diferença', () => {
    expect(partirQuantidade('saida', 5, { emUso: 0, emEstoque: 2 })).toEqual({
      normal: 5,
      regularizacao: 3,
    })
  })

  it('estoque negativo (não deveria existir) não faz o acerto encolher', () => {
    expect(partirQuantidade('saida', 1, { emUso: 0, emEstoque: -4 })).toEqual({
      normal: 1,
      regularizacao: 5,
    })
  })

  it('a saída NUNCA é partida: `normal` é sempre a quantidade pedida', () => {
    for (const q of [1, 4, 10]) {
      for (const emEstoque of [-1, 0, 1, 3, 50]) {
        expect(partirQuantidade('saida', q, { emUso: 0, emEstoque }).normal).toBe(q)
      }
    }
  })
})

describe('partirQuantidade — o que NÃO se parte', () => {
  it.each(['entrada', 'ajuste', 'reserva', 'liberacao'] as const)(
    '%s passa inteiro, sem acerto',
    (tipo) => {
      expect(partirQuantidade(tipo, 3, { emUso: 0, emEstoque: 0 })).toEqual({
        normal: 3,
        regularizacao: 0,
      })
    },
  )

  it('quantidade zero ou negativa passa inteira (quem recusa é o CHECK do banco)', () => {
    expect(partirQuantidade('retorno', 0, { emUso: 0, emEstoque: 0 })).toEqual({
      normal: 0,
      regularizacao: 0,
    })
    expect(partirQuantidade('saida', -2, { emUso: 0, emEstoque: 0 })).toEqual({
      normal: -2,
      regularizacao: 0,
    })
  })
})

describe('textoDaRegularizacao — a justificativa que o CHECK do banco exige', () => {
  it('nunca devolve vazio, nem sem item nem sem pessoa', () => {
    const t = textoDaRegularizacao('devolucao', { quantidade: 1 })
    expect(t.trim().length).toBeGreaterThan(0)
    expect(t).toContain(PREFIXO_REGULARIZACAO)
  })

  it('a devolução diz que voltou com o equipamento e que não havia saída registrada', () => {
    const t = textoDaRegularizacao('devolucao', {
      itemRotulo: 'Carregador',
      quantidade: 1,
      colaborador: 'Fulano de Tal',
    })
    expect(t).toContain('Carregador')
    expect(t).toContain('Fulano de Tal')
    expect(t).toContain('voltou com o equipamento')
    expect(t).toContain('não havia saída registrada')
  })

  it('a entrega diz que a filial não tinha a quantidade em estoque', () => {
    const t = textoDaRegularizacao('entrega', { itemRotulo: 'Mouse', quantidade: 2 })
    expect(t).toContain('2 unidades')
    expect(t).toContain('não tinha essa quantidade em estoque')
  })

  it('a pendência se identifica como tal (é outra mesa, e o histórico tem de dizer)', () => {
    const t = textoDaRegularizacao('pendencia', { itemRotulo: 'Mochila', quantidade: 1 })
    expect(t).toContain('mesa de pendências')
  })

  it('singular e plural concordam', () => {
    expect(textoDaRegularizacao('devolucao', { quantidade: 1 })).toContain('1 unidade de')
    expect(textoDaRegularizacao('devolucao', { quantidade: 3 })).toContain('3 unidades de')
  })

  it('respeita o teto de 500 do banco mesmo com nome de item absurdo', () => {
    const t = textoDaRegularizacao('devolucao', {
      itemRotulo: 'x'.repeat(900),
      quantidade: 1,
      colaborador: 'y'.repeat(900),
    })
    expect(t.length).toBeLessThanOrEqual(500)
  })
})

describe('avisoDeRegularizacao — a linha discreta do painel de sucesso', () => {
  it('cala a boca quando não houve acerto nenhum', () => {
    expect(avisoDeRegularizacao(0, 0)).toBeNull()
    expect(avisoDeRegularizacao(0, 2)).toBeNull()
    expect(avisoDeRegularizacao(3, 0)).toBeNull()
  })

  it('uma unidade de um item fala no singular', () => {
    const t = avisoDeRegularizacao(1, 1)
    expect(t).toContain('1 item')
    expect(t).toContain('entrou no estoque por acerto automático')
  })

  it('vários itens somam unidades e linhas', () => {
    expect(avisoDeRegularizacao(2, 2)).toContain('2 unidades de 2 itens')
    expect(avisoDeRegularizacao(5, 1)).toContain('5 unidades de 1 item')
  })
})
