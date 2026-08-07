import { describe, it, expect } from 'vitest'
import {
  MAX_LINHAS_LOTE_ITEM,
  MSG_ITEM_REPETIDO,
  MSG_MOTIVO_ESTORNO_MAX,
  TETO_MOTIVO_ESTORNO,
  atualizarItemSchema,
  errosPorLinhaDoLote,
  erroQuantidadeLancamento,
  estornoLancamentoSchema,
  exigeChamado,
  explodirLoteLancamentoItem,
  faltaJustificativaAjuste,
  indicesDeItemRepetido,
  itemCatalogoSchema,
  itemInlineSchema,
  lancamentoItemSchema,
  loteLancamentoItemSchema,
  precisaRepor,
  proximaOrdemDoGrupo,
} from '@/lib/validators/item'

// Lançamento de itens por quantidade. Dados 100% fictícios (CLAUDE.md).
const DATA_OK = '2020-01-01' // passada — nunca futura

function loteBase(over: Record<string, unknown> = {}) {
  return {
    filial_id: 1,
    tipo: 'entrada',
    linhas: [{ item_id: 1, quantidade: 5 }],
    data: DATA_OK,
    ...over,
  }
}

describe('regras puras por tipo', () => {
  it('ajuste aceita negativo mas rejeita zero', () => {
    expect(erroQuantidadeLancamento('ajuste', -3)).toBeNull()
    expect(erroQuantidadeLancamento('ajuste', 3)).toBeNull()
    expect(erroQuantidadeLancamento('ajuste', 0)).toBe('O ajuste não pode ser zero')
  })

  it('demais tipos exigem quantidade positiva', () => {
    expect(erroQuantidadeLancamento('entrada', 1)).toBeNull()
    expect(erroQuantidadeLancamento('entrada', 0)).toBe('A quantidade deve ser maior que zero')
    expect(erroQuantidadeLancamento('saida', -1)).toBe('A quantidade deve ser maior que zero')
  })

  it('chamado obrigatório só em reserva e liberação', () => {
    expect(exigeChamado('reserva')).toBe(true)
    expect(exigeChamado('liberacao')).toBe(true)
    expect(exigeChamado('entrada')).toBe(false)
    expect(exigeChamado('ajuste')).toBe(false)
  })

  it('justificativa só cobrada no ajuste, com 3+ caracteres', () => {
    expect(faltaJustificativaAjuste('entrada', undefined)).toBe(false)
    expect(faltaJustificativaAjuste('ajuste', undefined)).toBe(true)
    expect(faltaJustificativaAjuste('ajuste', ' ab ')).toBe(true)
    expect(faltaJustificativaAjuste('ajuste', 'inventário')).toBe(false)
  })
})

describe('indicesDeItemRepetido', () => {
  it('vazio quando todos os itens são distintos', () => {
    expect(indicesDeItemRepetido([{ item_id: 1 }, { item_id: 2 }])).toEqual([])
  })

  it('marca a 2ª ocorrência em diante', () => {
    expect(
      indicesDeItemRepetido([{ item_id: 7 }, { item_id: 2 }, { item_id: 7 }, { item_id: 7 }]),
    ).toEqual([2, 3])
  })
})

describe('lancamentoItemSchema (lançamento simples — comportamento da F3B)', () => {
  it('aceita entrada válida', () => {
    const r = lancamentoItemSchema.safeParse({
      item_id: 1,
      filial_id: 2,
      tipo: 'entrada',
      quantidade: 10,
      data: DATA_OK,
    })
    expect(r.success).toBe(true)
  })

  it('reserva sem chamado falha com a mensagem de sempre', () => {
    const r = lancamentoItemSchema.safeParse({
      item_id: 1,
      filial_id: 2,
      tipo: 'reserva',
      quantidade: 1,
      data: DATA_OK,
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.message.includes('chamado é obrigatório'))).toBe(true)
  })

  it('ajuste sem justificativa falha', () => {
    const r = lancamentoItemSchema.safeParse({
      item_id: 1,
      filial_id: 2,
      tipo: 'ajuste',
      quantidade: -2,
      data: DATA_OK,
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === 'observacao')).toBe(true)
  })
})

describe('loteLancamentoItemSchema (carrinho — F10 · I1)', () => {
  it('aceita carrinho de 3 itens distintos', () => {
    const r = loteLancamentoItemSchema.safeParse(
      loteBase({
        linhas: [
          { item_id: 1, quantidade: 5 },
          { item_id: 2, quantidade: 2 },
          { item_id: 3, quantidade: 1 },
        ],
      }),
    )
    expect(r.success).toBe(true)
  })

  it('exige ao menos uma linha', () => {
    const r = loteLancamentoItemSchema.safeParse(loteBase({ linhas: [] }))
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('Adicione ao menos um item ao lançamento')
  })

  it(`aceita ${MAX_LINHAS_LOTE_ITEM} linhas e recusa ${MAX_LINHAS_LOTE_ITEM + 1}`, () => {
    const linhas = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ item_id: i + 1, quantidade: 1 }))
    expect(loteLancamentoItemSchema.safeParse(loteBase({ linhas: linhas(MAX_LINHAS_LOTE_ITEM) })).success).toBe(true)
    const r = loteLancamentoItemSchema.safeParse(
      loteBase({ linhas: linhas(MAX_LINHAS_LOTE_ITEM + 1) }),
    )
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toContain(String(MAX_LINHAS_LOTE_ITEM))
  })

  it('bloqueia o mesmo item duas vezes, apontando a linha repetida', () => {
    const r = loteLancamentoItemSchema.safeParse(
      loteBase({
        linhas: [
          { item_id: 4, quantidade: 1 },
          { item_id: 4, quantidade: 2 },
        ],
      }),
    )
    expect(r.success).toBe(false)
    const issue = r.error?.issues.find((i) => i.message === MSG_ITEM_REPETIDO)
    expect(issue?.path).toEqual(['linhas', 1, 'item_id'])
  })

  it('quantidade inválida marca só a linha culpada', () => {
    const r = loteLancamentoItemSchema.safeParse(
      loteBase({
        linhas: [
          { item_id: 1, quantidade: 5 },
          { item_id: 2, quantidade: 0 },
        ],
      }),
    )
    expect(r.success).toBe(false)
    const porLinha = errosPorLinhaDoLote(r.error?.issues ?? [])
    expect(porLinha.get(0)).toBeUndefined()
    expect(porLinha.get(1)).toBe('A quantidade deve ser maior que zero')
  })

  it('linha sem item e linha sem quantidade caem na PRÓPRIA linha', () => {
    const r = loteLancamentoItemSchema.safeParse(
      loteBase({
        linhas: [
          { item_id: 0, quantidade: 1 },
          { item_id: 2, quantidade: NaN },
        ],
      }),
    )
    expect(r.success).toBe(false)
    const porLinha = errosPorLinhaDoLote(r.error?.issues ?? [])
    expect(porLinha.get(0)).toBe('Escolha o item')
    expect(porLinha.get(1)).toBe('Informe a quantidade')
  })

  it('ajuste aceita quantidade negativa por linha, com justificativa', () => {
    const r = loteLancamentoItemSchema.safeParse(
      loteBase({
        tipo: 'ajuste',
        linhas: [
          { item_id: 1, quantidade: -3 },
          { item_id: 2, quantidade: 4 },
        ],
        observacao: 'Inventário fictício',
      }),
    )
    expect(r.success).toBe(true)
  })

  it('regras comuns valem para o lançamento inteiro (chamado em reserva)', () => {
    const r = loteLancamentoItemSchema.safeParse(
      loteBase({ tipo: 'reserva', linhas: [{ item_id: 1, quantidade: 1 }] }),
    )
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === 'chamado')).toBe(true)
  })

  it('data futura continua barrada', () => {
    const r = loteLancamentoItemSchema.safeParse(loteBase({ data: '2999-12-31' }))
    expect(r.success).toBe(false)
  })
})

describe('explodirLoteLancamentoItem', () => {
  it('repete os campos comuns em cada linha, preservando a ordem', () => {
    const r = loteLancamentoItemSchema.safeParse(
      loteBase({
        tipo: 'reserva',
        chamado: '4321',
        colaborador: 'Fulano da Silva',
        observacao: 'NF fictícia',
        linhas: [
          { item_id: 9, quantidade: 2 },
          { item_id: 8, quantidade: 1 },
        ],
      }),
    )
    expect(r.success).toBe(true)
    const linhas = explodirLoteLancamentoItem(r.data!)
    expect(linhas).toHaveLength(2)
    expect(linhas.map((l) => l.item_id)).toEqual([9, 8])
    expect(linhas.every((l) => l.chamado === '4321' && l.tipo === 'reserva')).toBe(true)
    expect(linhas[0].colaborador).toBe('Fulano da Silva')
    expect(linhas[1].quantidade).toBe(1)
  })
})

describe('errosPorLinhaDoLote', () => {
  it('ignora issues fora de `linhas` e guarda só a primeira de cada linha', () => {
    const mapa = errosPorLinhaDoLote([
      { path: ['chamado'], message: 'fora do carrinho' },
      { path: ['linhas', 1, 'quantidade'], message: 'primeira da linha 1' },
      { path: ['linhas', 1, 'item_id'], message: 'segunda da linha 1' },
      { path: ['linhas'], message: 'sem índice' },
    ])
    expect(mapa.get(1)).toBe('primeira da linha 1')
    expect(mapa.size).toBe(1)
  })
})

describe('criar item inline (I2)', () => {
  it('itemInlineSchema pede nome e grupo, sem ordem', () => {
    const r = itemInlineSchema.safeParse({ nome: 'Headset USB fictício', grupo: 'acessorio' })
    expect(r.success).toBe(true)
    expect('ordem' in (r.data ?? {})).toBe(false)
  })

  it('nome curto é recusado', () => {
    expect(itemInlineSchema.safeParse({ nome: 'a', grupo: 'acessorio' }).success).toBe(false)
  })

  it('grupo fora do enum é recusado', () => {
    expect(itemInlineSchema.safeParse({ nome: 'Cabo fictício', grupo: 'outro' }).success).toBe(false)
  })

  it('proximaOrdemDoGrupo: grupo vazio começa em 0 e sobe de 10 em 10', () => {
    expect(proximaOrdemDoGrupo(null)).toBe(0)
    expect(proximaOrdemDoGrupo(undefined)).toBe(0)
    expect(proximaOrdemDoGrupo(0)).toBe(10)
    expect(proximaOrdemDoGrupo(30)).toBe(40)
  })

  it('proximaOrdemDoGrupo respeita o teto 999 do schema', () => {
    expect(proximaOrdemDoGrupo(995)).toBe(999)
    expect(proximaOrdemDoGrupo(999)).toBe(999)
  })
})

// ---------------------------------------------------------------------------
// Estoque mínimo / ponto de reposição (F12 · I5)
// ---------------------------------------------------------------------------

describe('precisaRepor', () => {
  it('mínimo 0 NUNCA repõe — nem com estoque zerado ou negativo', () => {
    expect(precisaRepor(0, 0)).toBe(false)
    expect(precisaRepor(10, 0)).toBe(false)
    expect(precisaRepor(-3, 0)).toBe(false)
  })

  it('estoque abaixo do mínimo repõe', () => {
    expect(precisaRepor(3, 5)).toBe(true)
    expect(precisaRepor(0, 1)).toBe(true)
  })

  it('estoque IGUAL ao mínimo não repõe (o mínimo é o piso aceitável)', () => {
    expect(precisaRepor(5, 5)).toBe(false)
    expect(precisaRepor(1, 1)).toBe(false)
  })

  it('estoque acima do mínimo não repõe', () => {
    expect(precisaRepor(6, 5)).toBe(false)
    expect(precisaRepor(999, 5)).toBe(false)
  })

  it('mínimo negativo (impossível pelo check da 0042) desliga o alerta', () => {
    expect(precisaRepor(0, -1)).toBe(false)
    expect(precisaRepor(-5, -1)).toBe(false)
  })
})

describe('estoque_minimo no schema do catálogo', () => {
  const base = { nome: 'Mouse fictício', grupo: 'acessorio' as const, ordem: 0 }

  it('ausente vira 0 (default = sem alerta, igual à coluna)', () => {
    const r = itemCatalogoSchema.safeParse(base)
    expect(r.success).toBe(true)
    expect(r.data?.estoque_minimo).toBe(0)
  })

  it('aceita inteiro ≥ 0 e coage o texto do input numérico', () => {
    expect(itemCatalogoSchema.safeParse({ ...base, estoque_minimo: 5 }).data?.estoque_minimo).toBe(5)
    expect(itemCatalogoSchema.safeParse({ ...base, estoque_minimo: '12' }).data?.estoque_minimo).toBe(12)
  })

  it('recusa negativo com mensagem em pt-BR', () => {
    const r = itemCatalogoSchema.safeParse({ ...base, estoque_minimo: -1 })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('O estoque mínimo não pode ser negativo')
  })

  it('recusa quebrado e acima do teto', () => {
    expect(itemCatalogoSchema.safeParse({ ...base, estoque_minimo: 1.5 }).success).toBe(false)
    expect(itemCatalogoSchema.safeParse({ ...base, estoque_minimo: 10000 }).success).toBe(false)
  })

  it('atualizarItemSchema herda o campo', () => {
    const r = atualizarItemSchema.safeParse({ ...base, id: 1, ativo: true, estoque_minimo: 7 })
    expect(r.success).toBe(true)
    expect(r.data?.estoque_minimo).toBe(7)
  })

  it('itemInlineSchema (criar no meio do lançamento) NÃO pede o mínimo', () => {
    const r = itemInlineSchema.safeParse({ nome: 'Cabo fictício', grupo: 'acessorio' })
    expect(r.success).toBe(true)
    expect('estoque_minimo' in (r.data ?? {})).toBe(false)
    expect('ordem' in (r.data ?? {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Estorno de lançamento — motivo opcional (ITN-05c)
// ---------------------------------------------------------------------------

describe('estornoLancamentoSchema', () => {
  const idFicticio = '11111111-1111-4111-8111-111111111111'

  it('aceita sem motivo (comportamento de hoje)', () => {
    const r = estornoLancamentoSchema.safeParse({ lancamento_id: idFicticio })
    expect(r.success).toBe(true)
    expect(r.data?.motivo).toBeUndefined()
  })

  it('string vazia vira ausente, e o motivo é aparado', () => {
    expect(
      estornoLancamentoSchema.safeParse({ lancamento_id: idFicticio, motivo: '' }).data?.motivo,
    ).toBeUndefined()
    expect(
      estornoLancamentoSchema.safeParse({ lancamento_id: idFicticio, motivo: '  peça trocada  ' })
        .data?.motivo,
    ).toBe('peça trocada')
  })

  it('recusa motivo acima do teto, com a mensagem em pt-BR', () => {
    const r = estornoLancamentoSchema.safeParse({
      lancamento_id: idFicticio,
      motivo: 'a'.repeat(TETO_MOTIVO_ESTORNO + 1),
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe(MSG_MOTIVO_ESTORNO_MAX)
  })

  it('aceita motivo exatamente no teto', () => {
    const r = estornoLancamentoSchema.safeParse({
      lancamento_id: idFicticio,
      motivo: 'a'.repeat(TETO_MOTIVO_ESTORNO),
    })
    expect(r.success).toBe(true)
  })

  it('lançamento inválido continua recusado independente do motivo', () => {
    const r = estornoLancamentoSchema.safeParse({ lancamento_id: 'não-é-uuid', motivo: 'x' })
    expect(r.success).toBe(false)
  })
})
