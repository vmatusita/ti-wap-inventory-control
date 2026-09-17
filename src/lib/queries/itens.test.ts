import { describe, expect, it , vi } from 'vitest'

// F49 — um módulo de `@/lib/queries/**` (ou algo que ele alcança) passou a declarar
// `import 'server-only'`, que é a fronteira RSC: ele existe para QUEBRAR o build se um
// Client Component importar a query. No ambiente `node` do Vitest esse import lança
// sempre, então o stub vazio. Não afrouxa nada — quem prova a fronteira é o
// `npm run build` (ver `src/lib/queries/servidor-apenas.test.ts`).
vi.mock('server-only', () => ({}))
import {
  combinarSaldosPorFilial,
  estoqueForaDasColunas,
  montarSaldosPorFilial,
  separarNiveisDeSaldo,
  somarSaldosDaSelecao,
  somarSaldosDeFiliais,
  type SaldoItem,
  type SaldoItemFiliais,
  type SaldoItemNivel,
} from '@/lib/queries/itens'
import type { Filial } from '@/lib/queries/filiais'

// I4 (F11) — a tabela lado a lado é montada por ESTA função pura a partir das
// linhas por filial e do consolidado de `rel_saldo_itens_filiais` — desde a F60 os
// dois níveis de UMA chamada, separados por `montarSaldosPorFilial` (até a F59, N+1
// leituras de `rel_saldo_itens`: uma por filial + a consolidada). O que
// importa: cada número cair na coluna da SUA filial, filial sem lançamento vir
// zerada (nunca buraco) e a ordem da leitura consolidada mandar.
// Filiais e itens 100% fictícios.

const FILIAIS: Filial[] = [
  { id: 1, slug: 'alfa', nome: 'Filial Alfa', cidade: 'Cidade Alfa' },
  { id: 2, slug: 'beta', nome: 'Filial Beta', cidade: 'Cidade Beta' },
  { id: 3, slug: 'gama', nome: 'Filial Gama', cidade: 'Cidade Gama' },
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

// ---------------------------------------------------------------------------
// F25 — somar N filiais quando o filtro é MULTI
// ---------------------------------------------------------------------------
// Na F25 `rel_saldo_itens` (0016) recebia UMA filial ou NULL, e com o filtro virando
// multi-seleção 2+ filiais viraram N leituras somadas em memória. Desde a F60 é UMA
// chamada de `rel_saldo_itens_filiais` com a lista (`somarSaldosDaSelecao`), e as
// linhas por filial continuam somadas aqui — a mesma aritmética que
// `combinarSaldosPorFilial` já usava.
describe('somarSaldosDeFiliais (F25)', () => {
  it('soma célula a célula as leituras de cada filial', () => {
    const r = somarSaldosDeFiliais([
      [saldo(10, 'Mouse', { total: 8, estoque: 7, atrelados: 1, falta: 2 })],
      [saldo(10, 'Mouse', { total: 4, estoque: 2, atrelados: 2, falta: 1 })],
    ])
    expect(r).toEqual([
      saldo(10, 'Mouse', { total: 12, estoque: 9, atrelados: 3, falta: 3 }),
    ])
  })

  it('item que existe só numa das filiais entra com o valor dela', () => {
    const r = somarSaldosDeFiliais([
      [saldo(10, 'Mouse', { estoque: 5 })],
      [saldo(10, 'Mouse', { estoque: 1 }), saldo(20, 'Teclado', { estoque: 4 })],
    ])
    expect(r).toHaveLength(2)
    expect(r.find((s) => s.item_id === 10)?.estoque).toBe(6)
    expect(r.find((s) => s.item_id === 20)?.estoque).toBe(4)
  })

  it('preserva a ordem da RPC (ordem de inserção da primeira leitura)', () => {
    const r = somarSaldosDeFiliais([
      [saldo(30, 'Cabo'), saldo(10, 'Mouse'), saldo(20, 'Teclado')],
      [saldo(20, 'Teclado'), saldo(30, 'Cabo')],
    ])
    expect(r.map((s) => s.item_id)).toEqual([30, 10, 20])
  })

  it('NÃO altera os objetos recebidos (as leituras são reusadas na página)', () => {
    const a = saldo(10, 'Mouse', { estoque: 5 })
    const b = saldo(10, 'Mouse', { estoque: 3 })
    somarSaldosDeFiliais([[a], [b]])
    expect(a.estoque).toBe(5)
    expect(b.estoque).toBe(3)
  })

  it('lista vazia devolve vazio', () => {
    expect(somarSaldosDeFiliais([])).toEqual([])
    expect(somarSaldosDeFiliais([[], []])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// F60 · lote 2 — o saldo em DOIS NÍVEIS numa chamada (PLAN-F60 §6.4)
// ---------------------------------------------------------------------------
// `rel_saldo_itens_filiais` devolve, numa chamada, as linhas por filial da lista e o NÍVEL DO TOTAL
// (`filial_id` null). As fixtures abaixo são o que a RPC devolveria — fictícias, montadas à mão com
// a aritmética da 0143. Três filiais: Alfa (1) e Beta (2) ATIVAS, as colunas da tela; Gama (3) fora
// das colunas (a filial DESATIVADA com saldo — `listarFiliais` não a devolve, o consolidado a soma).

const nivel = (
  filial_id: number | null,
  item_id: number,
  item: string,
  vals: Partial<Omit<SaldoItem, 'item_id' | 'item' | 'grupo' | 'ordem'>> = {},
): SaldoItemNivel => ({ filial_id, ...saldo(item_id, item, vals) })

const COLUNAS: Filial[] = [FILIAIS[0], FILIAIS[1]] // Alfa e Beta — a Gama (3) fica FORA

/** Todas as filiais, e a Gama (fora das colunas) com 4 mouses em estoque. */
const COM_ESTOQUE_FORA: SaldoItemNivel[] = [
  nivel(null, 10, 'Mouse', { total: 12, estoque: 12 }),
  nivel(null, 20, 'Teclado', { total: 5, estoque: 5 }),
  nivel(1, 10, 'Mouse', { total: 5, estoque: 5 }),
  nivel(1, 20, 'Teclado', { total: 2, estoque: 2 }),
  nivel(2, 10, 'Mouse', { total: 3, estoque: 3 }),
  nivel(2, 20, 'Teclado', { total: 3, estoque: 3 }),
  nivel(3, 10, 'Mouse', { total: 4, estoque: 4 }),
  nivel(3, 20, 'Teclado'),
]

/** Todas as filiais, e a Gama zerada: nada fora das colunas. */
const SEM_ESTOQUE_FORA: SaldoItemNivel[] = [
  nivel(null, 10, 'Mouse', { total: 8, estoque: 8 }),
  nivel(null, 20, 'Teclado', { total: 5, estoque: 5 }),
  nivel(1, 10, 'Mouse', { total: 5, estoque: 5 }),
  nivel(1, 20, 'Teclado', { total: 2, estoque: 2 }),
  nivel(2, 10, 'Mouse', { total: 3, estoque: 3 }),
  nivel(2, 20, 'Teclado', { total: 3, estoque: 3 }),
  nivel(3, 10, 'Mouse'),
  nivel(3, 20, 'Teclado'),
]

/**
 * A propriedade que a tela promete: `estoqueForaDasColunas` > 0 EXATAMENTE nos itens que têm estoque
 * numa filial fora das colunas (lido das linhas por filial da fixture), e 0 no resto. Devolve os
 * itens que VIOLAM — `[]` é a promessa cumprida.
 */
function violacoesDoForaDasColunas(
  montar: (filiais: Filial[], linhas: readonly SaldoItemNivel[]) => SaldoItemFiliais[],
  linhas: readonly SaldoItemNivel[],
): string[] {
  const ids = new Set(COLUNAS.map((f) => f.id))
  const foraEsperado = (itemId: number) =>
    linhas
      .filter((l) => l.item_id === itemId && l.filial_id !== null && !ids.has(l.filial_id))
      .reduce((acc, l) => acc + l.estoque, 0)
  return montar(COLUNAS, linhas)
    .filter((l) => estoqueForaDasColunas(l, COLUNAS) > 0 !== foraEsperado(l.item_id) > 0)
    .map((l) => l.item)
}

/** A emenda DESFEITA — o consolidado pela soma das colunas, em vez do nível do total. */
function montarSemDoisNiveis(filiais: Filial[], linhas: readonly SaldoItemNivel[]): SaldoItemFiliais[] {
  const { porFilial } = separarNiveisDeSaldo(linhas)
  const colunas = filiais.map((f) => porFilial.get(f.id) ?? [])
  return combinarSaldosPorFilial(filiais, somarSaldosDeFiliais(colunas), colunas)
}

describe('separarNiveisDeSaldo (F60)', () => {
  it('põe o nível do total de um lado e as linhas de cada filial do outro, sem o `filial_id` e na ordem da RPC', () => {
    const { total, porFilial } = separarNiveisDeSaldo(COM_ESTOQUE_FORA)
    expect(total).toEqual([saldo(10, 'Mouse', { total: 12, estoque: 12 }), saldo(20, 'Teclado', { total: 5, estoque: 5 })])
    expect([...porFilial.keys()]).toEqual([1, 2, 3])
    expect(porFilial.get(3)).toEqual([saldo(10, 'Mouse', { total: 4, estoque: 4 }), saldo(20, 'Teclado')])
    expect(Object.hasOwn(total[0], 'filial_id')).toBe(false)
  })

  it('lista vazia (a RPC com NULL ou `{}`) não inventa nível nenhum', () => {
    const { total, porFilial } = separarNiveisDeSaldo([])
    expect(total).toEqual([])
    expect(porFilial.size).toBe(0)
  })
})

describe('montarSaldosPorFilial — colunas e consolidado de UMA chamada (F60)', () => {
  it('(a) o "fora das colunas" é > 0 EXATAMENTE quando uma filial fora das colunas tem estoque', () => {
    const itens = montarSaldosPorFilial(COLUNAS, COM_ESTOQUE_FORA)
    const [mouse, teclado] = itens
    expect(mouse.consolidado.estoque).toBe(12) // o nível do total, com a Gama dentro
    expect(mouse.porFilial[1].estoque + mouse.porFilial[2].estoque).toBe(8)
    expect(estoqueForaDasColunas(mouse, COLUNAS)).toBe(4)
    expect(estoqueForaDasColunas(teclado, COLUNAS)).toBe(0)
    expect(violacoesDoForaDasColunas(montarSaldosPorFilial, COM_ESTOQUE_FORA)).toEqual([])
  })

  it('(a) e é ZERO no resto — nada fora das colunas, nada a denunciar', () => {
    for (const linha of montarSaldosPorFilial(COLUNAS, SEM_ESTOQUE_FORA)) {
      expect(estoqueForaDasColunas(linha, COLUNAS), linha.item).toBe(0)
    }
    expect(violacoesDoForaDasColunas(montarSaldosPorFilial, SEM_ESTOQUE_FORA)).toEqual([])
  })

  it('(c) DESFAZER os dois níveis (consolidado = Σ colunas) deixa o "fora das colunas" sempre 0 — e a propriedade vermelha', () => {
    // A guarda do próprio teste: sem ela, uma `montarSaldosPorFilial` que somasse as colunas passaria
    // pelos casos "zero no resto" e só o primeiro a pegaria — e é exatamente o defeito que faz a
    // tela mentir com o teste da função pura verde.
    const [mouse] = montarSemDoisNiveis(COLUNAS, COM_ESTOQUE_FORA)
    expect(estoqueForaDasColunas(mouse, COLUNAS)).toBe(0)
    expect(violacoesDoForaDasColunas(montarSemDoisNiveis, COM_ESTOQUE_FORA)).toEqual(['Mouse'])
  })

  it('a coluna de uma filial é a linha DELA, e a filial fora das colunas não vira coluna', () => {
    const [, teclado] = montarSaldosPorFilial(COLUNAS, COM_ESTOQUE_FORA)
    expect(teclado.porFilial[1]).toEqual({ total: 2, estoque: 2, atrelados: 0, falta: 0 })
    expect(teclado.porFilial[3]).toBeUndefined() // a Gama não é coluna
  })
})

describe('somarSaldosDaSelecao — a multi-seleção numa chamada (F60)', () => {
  // Um chamado que ATRAVESSA filiais: reserva de 5 mouses na Alfa e liberação dos 5 na Beta. Por
  // filial, Alfa tem 5 atrelados (o `greatest(0, net)` do chamado nela) e Beta 0 (net −5, cortado em
  // 0); no nível do total da lista [1, 2] o net do chamado é 0 — zero atrelados. A multi-seleção de
  // hoje somava as N leituras de uma filial; o nível do total da lista daria OUTRO número.
  const DA_LISTA: SaldoItemNivel[] = [
    nivel(null, 10, 'Mouse', { total: 10, estoque: 10, atrelados: 0 }),
    nivel(1, 10, 'Mouse', { total: 10, estoque: 5, atrelados: 5 }),
    nivel(2, 10, 'Mouse', { total: 0, estoque: 0, atrelados: 0 }),
  ]
  // O que `rel_saldo_itens(1)` e `rel_saldo_itens(2)` devolviam, uma chamada cada.
  const HOJE_ALFA = [saldo(10, 'Mouse', { total: 10, estoque: 5, atrelados: 5 })]
  const HOJE_BETA = [saldo(10, 'Mouse', { total: 0, estoque: 0, atrelados: 0 })]

  it('(b) a soma é a de antes (N leituras de uma filial somadas), não o nível do total da lista', () => {
    const r = somarSaldosDaSelecao([1, 2], DA_LISTA)
    expect(r).toEqual(somarSaldosDeFiliais([HOJE_ALFA, HOJE_BETA]))
    expect(r[0].atrelados).toBe(5)
    expect(r).not.toEqual(separarNiveisDeSaldo(DA_LISTA).total)
  })

  it('(b) uma filial só: a própria linha dela (que é também o nível do total de uma filial)', () => {
    const umaSo: SaldoItemNivel[] = [
      nivel(null, 10, 'Mouse', { total: 10, estoque: 5, atrelados: 5 }),
      nivel(1, 10, 'Mouse', { total: 10, estoque: 5, atrelados: 5 }),
    ]
    expect(somarSaldosDaSelecao([1], umaSo)).toEqual(HOJE_ALFA)
    expect(separarNiveisDeSaldo(umaSo).total).toEqual(HOJE_ALFA)
  })

  it('a ordem da soma é a dos ids pedidos (a da primeira leitura manda, como antes)', () => {
    const linhas: SaldoItemNivel[] = [
      nivel(1, 30, 'Cabo'),
      nivel(1, 10, 'Mouse'),
      nivel(2, 10, 'Mouse'),
      nivel(2, 20, 'Teclado'),
    ]
    expect(somarSaldosDaSelecao([2, 1], linhas).map((s) => s.item_id)).toEqual([10, 20, 30])
    expect(somarSaldosDaSelecao([1, 2], linhas).map((s) => s.item_id)).toEqual([30, 10, 20])
  })
})
