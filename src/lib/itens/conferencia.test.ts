import { describe, expect, it } from 'vitest'
import {
  ajustesDaConferencia,
  baseDaConferencia,
  contagemDaLinha,
  linhasDaConferencia,
  observacaoDeInventario,
  particionar,
  resumoDaConferencia,
  somarEscrito,
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

describe('observacaoDeInventario', () => {
  it('é a justificativa de cada linha — nunca vazia (CHECK lanc_item_ajuste_obs)', () => {
    const obs = observacaoDeInventario('09/08/2026')
    expect(obs).toBe('Inventário de 09/08/2026')
    expect(obs.trim().length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// BASE CONGELADA + acumulado — a idempotência que NÃO depende de tempo.
// (2ª volta da revisão adversarial da F31.)
// ---------------------------------------------------------------------------

describe('baseDaConferencia', () => {
  it('congela o estoque de cada item da abertura', () => {
    expect(baseDaConferencia(SALDOS)).toEqual({ 1: 14, 2: 8, 3: 5, 4: 3, 5: 10, 6: 2 })
  })

  it('lista vazia vira mapa vazio', () => {
    expect(baseDaConferencia([])).toEqual({})
  })
})

describe('somarEscrito', () => {
  it('acumula por item, sem perder o que já havia', () => {
    const j1 = somarEscrito({}, [{ item_id: 3, quantidade: 2 }])
    expect(j1).toEqual({ 3: 2 })
    const j2 = somarEscrito(j1, [{ item_id: 3, quantidade: 1 }, { item_id: 5, quantidade: -4 }])
    expect(j2).toEqual({ 3: 3, 5: -4 })
  })

  it('SOMA em vez de sobrescrever — o mesmo item pode ser corrigido várias vezes', () => {
    const j = somarEscrito({ 3: 2 }, [{ item_id: 3, quantidade: 5 }])
    expect(j[3]).toBe(7)
  })

  it('não muta o mapa recebido', () => {
    const antes = { 3: 2 }
    somarEscrito(antes, [{ item_id: 3, quantidade: 1 }])
    expect(antes).toEqual({ 3: 2 })
  })

  it('nada gravado devolve o mesmo conteúdo', () => {
    expect(somarEscrito({ 3: 2 }, [])).toEqual({ 3: 2 })
  })
})

describe('o diff é "o que FALTA gravar", não "contado − sistema"', () => {
  const BASE = baseDaConferencia(SALDOS)

  it('sem nada gravado, é a diferença crua (o caso do dia a dia)', () => {
    const [l] = linhasDaConferencia(SALDOS, { 3: '7' }, BASE, {})
    expect(l.diff).toBe(2)
  })

  it('depois de gravar, zera — mesmo com o saldo do servidor AINDA velho', () => {
    // ⚠ Este é o caso que a 2ª revisão adversarial levantou: o `router.refresh()`
    // é um ida-e-volta de rede que não trava o campo, então existe uma janela em
    // que `saldos` ainda é o antigo. Antes da base congelada, o diff se
    // recalculava contra o número velho e o ajuste inteiro era reenviado.
    const [l] = linhasDaConferencia(SALDOS, { 3: '7' }, BASE, { 3: 2 })
    expect(l.diff).toBe(0)
    expect(l.sistema).toBe(5) // o saldo ao vivo continua o antigo — e tudo bem
  })

  it('e zera igualmente DEPOIS de o saldo novo chegar', () => {
    const saldosNovos = SALDOS.map((s) => (s.item_id === 3 ? { ...s, estoque: 7 } : s))
    const [l] = linhasDaConferencia(saldosNovos, { 3: '7' }, BASE, { 3: 2 })
    expect(l.diff).toBe(0)
    expect(l.sistema).toBe(7)
  })

  it('CORRIGIR depois de gravar manda só a diferença que falta', () => {
    // Gravou +2 (5 → 7) e agora percebe que eram 9: falta +2, não +4.
    const [l] = linhasDaConferencia(SALDOS, { 3: '9' }, BASE, { 3: 2 })
    expect(l.diff).toBe(2)
    expect(ajustesDaConferencia([l])).toEqual([{ item_id: 3, quantidade: 2 }])
  })

  it('corrigir PARA BAIXO gera ajuste negativo, também só do que falta', () => {
    // Gravou +2 (5 → 7) e agora percebe que eram 6: falta −1.
    const [l] = linhasDaConferencia(SALDOS, { 3: '6' }, BASE, { 3: 2 })
    expect(l.diff).toBe(-1)
  })

  it('clicar em registrar duas vezes na mesma tela não gera nada na segunda', () => {
    const contagens = { 3: '7', 5: '8' }
    const primeiro = ajustesDaConferencia(linhasDaConferencia(SALDOS, contagens, BASE, {}))
    expect(primeiro).toEqual([
      { item_id: 3, quantidade: 2 },
      { item_id: 5, quantidade: -2 },
    ])
    const depois = somarEscrito({}, primeiro)
    const segundo = ajustesDaConferencia(linhasDaConferencia(SALDOS, contagens, BASE, depois))
    expect(segundo).toEqual([])
  })

  it('envio PARCIAL: o reenvio manda só quem falhou, e uma vez só', () => {
    const contagens = { 3: '7', 5: '8' }
    const todos = ajustesDaConferencia(linhasDaConferencia(SALDOS, contagens, BASE, {}))
    // Só o item 3 entrou; o 5 falhou (concorrência).
    const escrito = somarEscrito({}, [todos[0]])
    const pendentes = ajustesDaConferencia(linhasDaConferencia(SALDOS, contagens, BASE, escrito))
    expect(pendentes).toEqual([{ item_id: 5, quantidade: -2 }])
  })

  it('item que apareceu no catálogo DEPOIS da abertura usa o saldo vivo como base', () => {
    const comItemNovo = [...SALDOS, saldo(7, 'Item que chegou depois', 4)]
    const [l] = linhasDaConferencia(comItemNovo, { 7: '6' }, BASE, {})
    expect(l.diff).toBe(2)
  })

  it('sem base nem acumulado (chamada antiga), continua sendo contado − sistema', () => {
    const [l] = linhasDaConferencia(SALDOS, { 3: '7' })
    expect(l.diff).toBe(2)
  })
})
