import { describe, expect, it } from 'vitest'
import {
  ajustesDaConferencia,
  contagemDaLinha,
  esquecerGravado,
  itensPendentes,
  linhasDaConferencia,
  observacaoDeInventario,
  particionar,
  resumoDaConferencia,
  textoResumoConferencia,
} from '@/lib/itens/conferencia'
import type { SaldoItem } from '@/lib/queries/itens'

// Dados 100% fictícios (CLAUDE.md).
function saldo(item_id: number, item: string, estoque: number): SaldoItem {
  return {
    item_id,
    item,
    grupo: 'acessorio',
    ordem: item_id * 10,
    total: estoque,
    estoque,
    atrelados: 0,
    falta: 0,
  }
}

// A filial fictícia do roteiro de ponta a ponta: 6 itens — 2 batendo, 2 sobrando,
// 2 faltando.
const SALDOS: SaldoItem[] = [
  saldo(1, 'Mouse USB', 14),
  saldo(2, 'Teclado ABNT2', 8),
  saldo(3, 'Cabo HDMI', 5),
  saldo(4, 'Adaptador USB-C', 3),
  saldo(5, 'Memória 8GB', 10),
  saldo(6, 'SSD 480GB', 2),
]

describe('contagemDaLinha (vazio ≠ zero — é a distinção que sustenta a tela)', () => {
  it('vazio, só espaços, nulo e indefinido são NÃO CONFERIDO', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(contagemDaLinha(v), JSON.stringify(v)).toBeNull()
    }
  })

  it('zero digitado é uma contagem de verdade (contei e não tinha nada)', () => {
    expect(contagemDaLinha('0')).toBe(0)
  })

  it('aceita inteiro positivo, com espaços em volta', () => {
    expect(contagemDaLinha(' 14 ')).toBe(14)
  })

  it('recusa negativo, fracionário e texto — não existe prateleira com −2', () => {
    for (const v of ['-2', '1.5', 'abc', 'NaN', 'Infinity', '1e3.5']) {
      expect(contagemDaLinha(v), v).toBeNull()
    }
  })
})

describe('linhasDaConferencia', () => {
  it('só devolve as linhas CONTADAS, e o diff é contado − sistema', () => {
    const linhas = linhasDaConferencia(SALDOS, { 1: '14', 3: '7', 5: '8' })
    expect(linhas.map((l) => l.itemId)).toEqual([1, 3, 5])
    expect(linhas.map((l) => l.diff)).toEqual([0, 2, -2])
  })

  it('linha em branco fica de FORA (não vira "contei zero")', () => {
    const linhas = linhasDaConferencia(SALDOS, { 1: '14', 2: '', 3: '   ' })
    expect(linhas.map((l) => l.itemId)).toEqual([1])
  })

  it('preserva a ordem dos saldos (grupo/ordem), não a de digitação', () => {
    const linhas = linhasDaConferencia(SALDOS, { 6: '2', 1: '14' })
    expect(linhas.map((l) => l.itemId)).toEqual([1, 6])
  })

  it('contagem de item que não está na tela é ignorada', () => {
    const linhas = linhasDaConferencia(SALDOS, { 999: '3' })
    expect(linhas).toEqual([])
  })

  it('leva o nome e o estoque do sistema para a linha', () => {
    const [l] = linhasDaConferencia(SALDOS, { 1: '10' })
    expect(l).toEqual({ itemId: 1, item: 'Mouse USB', sistema: 14, contado: 10, diff: -4 })
  })
})

describe('resumoDaConferencia (o roteiro de 6 itens: 2 batem, 2 sobram, 2 faltam)', () => {
  const CONTAGENS = { 1: '14', 2: '8', 3: '7', 4: '5', 5: '8', 6: '0' }

  it('conta certo os quatro números da barra', () => {
    const r = resumoDaConferencia(linhasDaConferencia(SALDOS, CONTAGENS))
    expect(r).toEqual({ conferidos: 6, comDiferenca: 4, sobrando: 4, faltando: 4 })
  })

  it('nada conferido dá tudo zero', () => {
    expect(resumoDaConferencia([])).toEqual({
      conferidos: 0,
      comDiferenca: 0,
      sobrando: 0,
      faltando: 0,
    })
  })

  it('linha que bate conta como conferida e NÃO como diferença', () => {
    const r = resumoDaConferencia(linhasDaConferencia(SALDOS, { 1: '14', 2: '8' }))
    expect(r.conferidos).toBe(2)
    expect(r.comDiferenca).toBe(0)
  })

  it('faltando é somado em MÓDULO (a barra mostra −N, não N negativo duas vezes)', () => {
    const r = resumoDaConferencia(linhasDaConferencia(SALDOS, { 5: '8', 6: '0' }))
    expect(r.faltando).toBe(4)
    expect(r.sobrando).toBe(0)
  })
})

describe('textoResumoConferencia', () => {
  it('diz o estado vazio sem números inventados', () => {
    expect(textoResumoConferencia(resumoDaConferencia([]))).toBe('Nada conferido ainda')
  })

  it('quando tudo bate, afirma isso em vez de "0 com diferença"', () => {
    const r = resumoDaConferencia(linhasDaConferencia(SALDOS, { 1: '14' }))
    expect(textoResumoConferencia(r)).toBe('1 conferido · tudo bate')
  })

  it('com diferença, traz os dois lados com sinal', () => {
    const r = resumoDaConferencia(
      linhasDaConferencia(SALDOS, { 1: '14', 2: '8', 3: '7', 4: '5', 5: '8', 6: '0' }),
    )
    expect(textoResumoConferencia(r)).toBe('6 conferidos · 4 com diferença (+4 / −4)')
  })
})

describe('ajustesDaConferencia', () => {
  it('só as divergências viram ajuste — linha que bate não gera lançamento', () => {
    const ajustes = ajustesDaConferencia(
      linhasDaConferencia(SALDOS, { 1: '14', 2: '8', 3: '7', 5: '8' }),
    )
    expect(ajustes).toEqual([
      { item_id: 3, quantidade: 2 },
      { item_id: 5, quantidade: -2 },
    ])
  })

  it('conferência que fecha certinho não gera ajuste NENHUM (refazer dá zerado)', () => {
    const ajustes = ajustesDaConferencia(
      linhasDaConferencia(SALDOS, { 1: '14', 2: '8', 3: '5', 4: '3', 5: '10', 6: '2' }),
    )
    expect(ajustes).toEqual([])
  })
})

describe('particionar (blocos do teto de linhas do lançamento)', () => {
  it('quebra em blocos do tamanho pedido, na ordem', () => {
    expect(particionar([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })

  it('lista menor que o teto vira um bloco só', () => {
    expect(particionar([1, 2], 10)).toEqual([[1, 2]])
  })

  it('lista exatamente no teto não cria bloco vazio no fim', () => {
    expect(particionar([1, 2, 3], 3)).toEqual([[1, 2, 3]])
  })

  it('lista vazia não vira bloco nenhum (nada a enviar)', () => {
    expect(particionar([], 10)).toEqual([])
  })

  it('teto inválido devolve um bloco só, em vez de laçar para sempre', () => {
    for (const teto of [0, -3, Number.NaN]) {
      expect(particionar([1, 2, 3], teto), String(teto)).toEqual([[1, 2, 3]])
    }
  })
})

describe('itensPendentes (idempotência do reenvio)', () => {
  const AJUSTES = [
    { item_id: 3, quantidade: 2 },
    { item_id: 5, quantidade: -2 },
    { item_id: 6, quantidade: -1 },
  ]

  it('reenviar manda só o que ainda não gravou', () => {
    expect(itensPendentes(AJUSTES, [3])).toEqual([
      { item_id: 5, quantidade: -2 },
      { item_id: 6, quantidade: -1 },
    ])
  })

  it('com tudo gravado, o reenvio não manda nada — nunca grava duas vezes', () => {
    expect(itensPendentes(AJUSTES, [3, 5, 6])).toEqual([])
  })

  it('sem nada gravado, manda tudo', () => {
    expect(itensPendentes(AJUSTES, [])).toEqual(AJUSTES)
  })

  it('id gravado que já não está na lista não atrapalha', () => {
    expect(itensPendentes(AJUSTES, [99])).toEqual(AJUSTES)
  })
})

describe('observacaoDeInventario', () => {
  it('é a justificativa de cada linha — nunca vazia (CHECK lanc_item_ajuste_obs)', () => {
    const obs = observacaoDeInventario('09/08/2026')
    expect(obs).toBe('Inventário de 09/08/2026')
    expect(obs.trim().length).toBeGreaterThan(0)
  })
})

describe('esquecerGravado (a outra metade da idempotência — achado da revisão F31)', () => {
  const AJUSTES = [
    { item_id: 3, quantidade: 2 },
    { item_id: 5, quantidade: -2 },
  ]

  it('tira só o item pedido, preservando a ordem dos demais', () => {
    expect(esquecerGravado([3, 5, 6], 5)).toEqual([3, 6])
  })

  it('item que não está na lista não muda nada', () => {
    expect(esquecerGravado([3, 5], 99)).toEqual([3, 5])
    expect(esquecerGravado([], 3)).toEqual([])
  })

  it('CORRIGIR uma contagem já gravada devolve o item aos pendentes', () => {
    // O furo que a revisão adversarial achou: sem `esquecerGravado`, o item
    // continuava filtrado para sempre e a correção sumia em silêncio.
    const gravados = [3, 5]
    expect(itensPendentes(AJUSTES, gravados)).toEqual([])
    const depoisDaCorrecao = esquecerGravado(gravados, 3)
    expect(itensPendentes(AJUSTES, depoisDaCorrecao)).toEqual([{ item_id: 3, quantidade: 2 }])
  })

  it('e o item corrigido volta a sair dos pendentes quando for gravado de novo', () => {
    const g1 = esquecerGravado([3, 5], 3)
    const g2 = [...g1, 3]
    expect(itensPendentes(AJUSTES, g2)).toEqual([])
  })
})
