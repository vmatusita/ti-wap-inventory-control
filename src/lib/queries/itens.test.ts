import { describe, expect, it } from 'vitest'
import {
  combinarSaldosPorFilial,
  estoqueForaDasColunas,
  type SaldoItem,
} from '@/lib/queries/itens'
import type { Filial } from '@/lib/queries/filiais'

// I4 (F11) — a tabela lado a lado é montada por ESTA função pura a partir de
// N+1 leituras da RPC `rel_saldo_itens` (uma por filial + a consolidada). O que
// importa: cada número cair na coluna da SUA filial, filial sem lançamento vir
// zerada (nunca buraco) e a ordem da leitura consolidada mandar.
// Filiais e itens 100% fictícios.

const FILIAIS: Filial[] = [
  { id: 1, slug: 'alfa', nome: 'Filial Alfa' },
  { id: 2, slug: 'beta', nome: 'Filial Beta' },
  { id: 3, slug: 'gama', nome: 'Filial Gama' },
]

function saldo(
  item_id: number,
  item: string,
  vals: Partial<Omit<SaldoItem, 'item_id' | 'item' | 'grupo' | 'ordem'>> = {},
): SaldoItem {
  return {
    item_id,
    item,
    grupo: 'acessorio',
    ordem: item_id,
    total: 0,
    estoque: 0,
    atrelados: 0,
    falta: 0,
    ...vals,
  }
}

describe('combinarSaldosPorFilial', () => {
  it('põe o saldo de cada filial na sua coluna e zera quem não tem lançamento', () => {
    const consolidado = [saldo(10, 'Mouse', { total: 12, estoque: 9 })]
    const porFilial = [
      [saldo(10, 'Mouse', { total: 8, estoque: 7 })], // Alfa
      [saldo(10, 'Mouse', { total: 4, estoque: 2 })], // Beta
      [], // Gama — nenhum lançamento deste item
    ]

    const [linha] = combinarSaldosPorFilial(FILIAIS, consolidado, porFilial)

    expect(linha.item).toBe('Mouse')
    expect(linha.porFilial[1].estoque).toBe(7)
    expect(linha.porFilial[2].estoque).toBe(2)
    expect(linha.porFilial[3]).toBeUndefined()
    expect(linha.consolidado.estoque).toBe(9)
  })

  it('mantém o "faltam N" na filial que tem o déficit, sem contaminar as outras', () => {
    const consolidado = [saldo(10, 'Teclado', { total: 5, estoque: 3, falta: 0 })]
    const porFilial = [
      [saldo(10, 'Teclado', { total: 5, estoque: 3 })],
      [saldo(10, 'Teclado', { atrelados: 2, falta: 2 })],
      [],
    ]

    const [linha] = combinarSaldosPorFilial(FILIAIS, consolidado, porFilial)

    expect(linha.porFilial[1].falta).toBe(0)
    expect(linha.porFilial[2].falta).toBe(2)
    expect(linha.consolidado.falta).toBe(0)
  })

  it('preserva a ordem da leitura consolidada (grupo · ordem · nome do banco)', () => {
    const consolidado = [
      saldo(7, 'Adaptador'),
      saldo(3, 'Cabo HDMI'),
      saldo(9, 'Webcam'),
    ]
    const porFilial = [[saldo(9, 'Webcam', { estoque: 1 })], [], []]

    const itens = combinarSaldosPorFilial(FILIAIS, consolidado, porFilial)

    expect(itens.map((i) => i.item)).toEqual(['Adaptador', 'Cabo HDMI', 'Webcam'])
  })

  it('não perde item que só apareceu numa filial — soma as filiais no total', () => {
    // Defesa: pela RPC o consolidado é superconjunto das filiais. Se um dia
    // deixar de ser, o item entra no fim em vez de sumir da tela.
    const porFilial = [
      [saldo(42, 'Fone', { total: 3, estoque: 3 })],
      [saldo(42, 'Fone', { total: 2, estoque: 1, atrelados: 1 })],
      [],
    ]

    const itens = combinarSaldosPorFilial(FILIAIS, [], porFilial)

    expect(itens).toHaveLength(1)
    expect(itens[0].porFilial[1].estoque).toBe(3)
    expect(itens[0].porFilial[2].estoque).toBe(1)
    expect(itens[0].consolidado).toEqual({
      total: 5,
      estoque: 4,
      atrelados: 1,
      falta: 0,
    })
  })

  it('sem filiais, devolve só as linhas do consolidado', () => {
    const itens = combinarSaldosPorFilial([], [saldo(1, 'Mouse', { estoque: 4 })], [])
    expect(itens).toHaveLength(1)
    expect(itens[0].porFilial).toEqual({})
    expect(itens[0].consolidado.estoque).toBe(4)
  })
})

// A6 (revisão adversarial da F11) — as colunas são só as filiais ATIVAS, o Total
// é a RPC consolidada (que soma até filial desativada). Quando a linha não fecha,
// a tela precisa dizer quanto ficou de fora.
describe('estoqueForaDasColunas', () => {
  it('devolve zero quando as colunas somam o Total (o caso normal)', () => {
    const [linha] = combinarSaldosPorFilial(
      FILIAIS,
      [saldo(10, 'Mouse', { estoque: 9 })],
      [
        [saldo(10, 'Mouse', { estoque: 7 })],
        [saldo(10, 'Mouse', { estoque: 2 })],
        [],
      ],
    )

    expect(estoqueForaDasColunas(linha, FILIAIS)).toBe(0)
  })

  it('devolve o estoque da filial que saiu das colunas (desativada)', () => {
    // "Filial Antiga" foi desativada: some de `listarFiliais`, mas os 15 mouses
    // dela continuam somando no consolidado.
    const [linha] = combinarSaldosPorFilial(
      FILIAIS,
      [saldo(10, 'Mouse', { estoque: 25 })],
      [
        [saldo(10, 'Mouse', { estoque: 6 })],
        [saldo(10, 'Mouse', { estoque: 3 })],
        [saldo(10, 'Mouse', { estoque: 1 })],
      ],
    )

    expect(estoqueForaDasColunas(linha, FILIAIS)).toBe(15)
  })

  it('não devolve negativo quando o Total é menor que as colunas', () => {
    // Não deveria acontecer (a RPC é aditiva por filial); se acontecer, a tela
    // não pode anunciar um "inclui -N".
    const [linha] = combinarSaldosPorFilial(
      FILIAIS,
      [saldo(10, 'Mouse', { estoque: 1 })],
      [[saldo(10, 'Mouse', { estoque: 4 })], [], []],
    )

    expect(estoqueForaDasColunas(linha, FILIAIS)).toBe(0)
  })

  it('conta como fora a filial que não está na lista de colunas', () => {
    const [linha] = combinarSaldosPorFilial(
      FILIAIS,
      [saldo(10, 'Mouse', { estoque: 9 })],
      [
        [saldo(10, 'Mouse', { estoque: 7 })],
        [saldo(10, 'Mouse', { estoque: 2 })],
        [],
      ],
    )

    // A tabela renderizada tem só a Alfa: os 2 da Beta ficam fora das colunas.
    expect(estoqueForaDasColunas(linha, [FILIAIS[0]])).toBe(2)
  })
})
