import { describe, expect, it } from 'vitest'
import {
  estoquePorItem,
  itensParaRepor,
  minimoDoItem,
  minimosDoCatalogo,
} from '@/lib/itens/repor'

// Cruzamento catálogo × saldo do ponto de reposição (F12 · I5). Dados 100%
// fictícios (CLAUDE.md) — os mesmos quatro casos semeados no ensaio.
const CATALOGO = [
  { id: 16, estoque_minimo: 5 }, // Mouse USB ficticio     — estoque 3  → repor
  { id: 17, estoque_minimo: 10 }, // Teclado ABNT2 ficticio — estoque 25 → não
  { id: 18, estoque_minimo: 0 }, // Cabo HDMI ficticio      — estoque 2  → nunca
  { id: 19, estoque_minimo: 4 }, // Memoria DDR4 ficticia   — estoque 4  → não
]

const SALDOS = [
  { item_id: 16, item: 'Mouse USB ficticio', estoque: 3 },
  { item_id: 17, item: 'Teclado ABNT2 ficticio', estoque: 25 },
  { item_id: 18, item: 'Cabo HDMI ficticio', estoque: 2 },
  { item_id: 19, item: 'Memoria DDR4 8GB ficticia', estoque: 4 },
]

const MINIMOS = minimosDoCatalogo(CATALOGO)

describe('minimosDoCatalogo / minimoDoItem', () => {
  it('indexa o catálogo por id', () => {
    expect(MINIMOS[16]).toBe(5)
    expect(MINIMOS[18]).toBe(0)
  })

  it('item fora do catálogo (desativado com saldo) vale 0 — nunca alerta', () => {
    expect(minimoDoItem(MINIMOS, 999)).toBe(0)
    expect(minimoDoItem({}, 16)).toBe(0)
  })

  it('valor inutilizável no mapa também vira 0 em vez de propagar NaN', () => {
    const sujo = { 1: Number.NaN, 2: -3 } as Record<number, number>
    expect(minimoDoItem(sujo, 1)).toBe(0)
    expect(minimoDoItem(sujo, 2)).toBe(0)
  })
})

describe('estoquePorItem', () => {
  it('indexa o estoque consolidado por item_id', () => {
    const mapa = estoquePorItem(SALDOS)
    expect(mapa[16]).toBe(3)
    expect(mapa[999]).toBeUndefined()
  })
})

describe('itensParaRepor', () => {
  it('lista vazia quando não há saldo nenhum', () => {
    expect(itensParaRepor([], MINIMOS)).toEqual([])
  })

  it('lista vazia quando todos estão acima do mínimo', () => {
    const acima = SALDOS.map((s) => ({ ...s, estoque: 100 }))
    expect(itensParaRepor(acima, MINIMOS)).toEqual([])
  })

  it('os quatro casos do ensaio: só o que está abaixo do mínimo entra', () => {
    const repor = itensParaRepor(SALDOS, MINIMOS)
    expect(repor.map((r) => r.item_id)).toEqual([16])
    expect(repor[0]).toMatchObject({ minimo: 5, estoque: 3, abaixo: 2 })
  })

  it('mínimo 0 é ignorado mesmo com estoque zerado', () => {
    const zerado = [{ item_id: 18, item: 'Cabo HDMI ficticio', estoque: 0 }]
    expect(itensParaRepor(zerado, MINIMOS)).toEqual([])
  })

  it('estoque IGUAL ao mínimo não entra (o mínimo é o piso aceitável)', () => {
    const igual = [{ item_id: 19, item: 'Memoria DDR4 8GB ficticia', estoque: 4 }]
    expect(itensParaRepor(igual, MINIMOS)).toEqual([])
  })

  it('item sem mínimo no mapa (desativado com saldo) não entra', () => {
    const orfao = [{ item_id: 999, item: 'Item desativado ficticio', estoque: 0 }]
    expect(itensParaRepor(orfao, MINIMOS)).toEqual([])
  })

  it('ordena do mais crítico para o menos, com o nome desempatando', () => {
    const minimos = minimosDoCatalogo([
      { id: 1, estoque_minimo: 10 },
      { id: 2, estoque_minimo: 10 },
      { id: 3, estoque_minimo: 20 },
    ])
    const repor = itensParaRepor(
      [
        { item_id: 1, item: 'Zebra ficticia', estoque: 8 },
        { item_id: 2, item: 'Abacaxi ficticio', estoque: 8 },
        { item_id: 3, item: 'Meio ficticio', estoque: 1 },
      ],
      minimos,
    )
    expect(repor.map((r) => r.item)).toEqual([
      'Meio ficticio', // abaixo 19
      'Abacaxi ficticio', // abaixo 2, empate resolvido pelo nome
      'Zebra ficticia', // abaixo 2
    ])
  })
})
