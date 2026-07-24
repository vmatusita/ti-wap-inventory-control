import { describe, expect, it } from 'vitest'
import { STATUS_ORDEM } from '@/lib/dominio'
import { MANUTENCAO_ALERTA_DIAS } from '@/lib/relatorios/manutencao-alerta'
import {
  LEGENDA_DELTA,
  LEGENDA_ESTORNO,
  LEGENDA_ESTORNO_ITENS,
  LEGENDA_MANUTENCAO,
  LEGENDA_TROCA,
  STATUS_VISIVEIS_RELATORIO,
  corDoCaso,
  glossarioRelatorio,
  legendaManutencaoPresente,
} from './legendas'

describe('glossarioRelatorio — cobertura e conteúdo (B4)', () => {
  const g = glossarioRelatorio()

  it('tem um verbete para CADA status de STATUS_ORDEM (trava de cobertura)', () => {
    const cobertos = new Set(g.map((v) => v.status).filter(Boolean))
    for (const s of STATUS_ORDEM) {
      expect(cobertos.has(s), `faltou verbete para o status "${s}"`).toBe(true)
    }
  })

  it('cobre todo STATUS_VISIVEIS_RELATORIO', () => {
    const cobertos = new Set(g.map((v) => v.status).filter(Boolean))
    for (const s of STATUS_VISIVEIS_RELATORIO) expect(cobertos.has(s)).toBe(true)
  })

  it('não tem termo vazio nem definição raquítica', () => {
    for (const v of g) {
      expect(v.termo.trim().length).toBeGreaterThan(0)
      expect(v.definicao.trim().length).toBeGreaterThan(10)
    }
  })

  it('explica "Guardados = Em estoque" e "Reserva técnica" (os apelidos)', () => {
    const emEstoque = g.find((v) => v.status === 'em_estoque')
    expect(emEstoque?.termo).toMatch(/Guardados/)
    const defasado = g.find((v) => v.status === 'defasado')
    expect(defasado?.termo).toMatch(/Reserva técnica/)
  })

  it('define Saída (saída+empréstimo), Entrada (com troca) e Transferência (duas filiais)', () => {
    const saida = g.find((v) => v.termo === 'Saída')
    expect(saida?.definicao.toLowerCase()).toMatch(/empréstimo/)
    const entrada = g.find((v) => v.termo === 'Entrada')
    expect(entrada?.definicao.toLowerCase()).toMatch(/troca/)
    expect(entrada?.definicao.toLowerCase()).toMatch(/compra/)
    const transf = g.find((v) => v.termo === 'Transferência')
    expect(transf?.definicao).toMatch(/DUAS filiais/i)
  })

  it('define o estoque as-of e o estorno (§8 regra 6)', () => {
    expect(g.some((v) => /último dia/i.test(v.termo) && /as-of/i.test(v.definicao))).toBe(true)
    const estorno = g.find((v) => v.termo === 'Estorno')
    expect(estorno?.definicao).toMatch(/continua incluindo/i)
  })
})

describe('corDoCaso — espelho da árvore de decisão do card (B3)', () => {
  it('devolvido ao fornecedor = slate (vence fechado)', () => {
    expect(corDoCaso({ desfecho: 'devolvido_fornecedor', fechado: true, diasEmManutencao: 100 })).toBe(
      'slate',
    )
  })
  it('fechado (voltou) = green', () => {
    expect(corDoCaso({ desfecho: 'retorno', fechado: true, diasEmManutencao: null })).toBe('green')
    expect(corDoCaso({ desfecho: undefined, fechado: true, diasEmManutencao: 5 })).toBe('green')
  })
  it('aberto: no limiar de 30 dias vira vermelho; abaixo, âmbar', () => {
    expect(corDoCaso({ desfecho: undefined, fechado: false, diasEmManutencao: MANUTENCAO_ALERTA_DIAS })).toBe(
      'red',
    )
    expect(
      corDoCaso({ desfecho: undefined, fechado: false, diasEmManutencao: MANUTENCAO_ALERTA_DIAS - 1 }),
    ).toBe('amber')
  })
  it('aberto sem dias conhecidos = sem badge (null)', () => {
    expect(corDoCaso({ desfecho: undefined, fechado: false, diasEmManutencao: null })).toBe(null)
  })
})

describe('legendaManutencaoPresente — só as cores presentes (B3)', () => {
  it('mostra só o que aparece, na ordem canônica', () => {
    const casos = [
      { desfecho: undefined, fechado: false, diasEmManutencao: 3 }, // amber
      { desfecho: 'devolvido_fornecedor' as const, fechado: true, diasEmManutencao: null }, // slate
    ]
    const cores = legendaManutencaoPresente(casos).map((l) => l.cor)
    expect(cores).toEqual(['amber', 'slate']) // ordem canônica preservada
    expect(cores).not.toContain('red')
    expect(cores).not.toContain('green')
  })

  it('vazio quando não há casos (nada de legenda fantasma)', () => {
    expect(legendaManutencaoPresente([])).toEqual([])
  })

  it('casos sem badge (null) não acendem nenhuma entrada', () => {
    expect(legendaManutencaoPresente([{ desfecho: undefined, fechado: false, diasEmManutencao: null }])).toEqual(
      [],
    )
  })
})

describe('constantes de legenda — forma e sincronia', () => {
  it('LEGENDA_DELTA nomeia as três cores e a variação', () => {
    expect(LEGENDA_DELTA).toMatch(/verde/)
    expect(LEGENDA_DELTA).toMatch(/vermelho/)
    expect(LEGENDA_DELTA).toMatch(/cinza/)
    expect(LEGENDA_DELTA).toMatch(/Δ/)
  })

  it('LEGENDA_MANUTENCAO tem as 4 cores e o limiar em sincronia com a constante', () => {
    expect(LEGENDA_MANUTENCAO.map((l) => l.cor)).toEqual(['amber', 'red', 'green', 'slate'])
    const vermelho = LEGENDA_MANUTENCAO.find((l) => l.cor === 'red')
    expect(vermelho?.texto).toContain(String(MANUTENCAO_ALERTA_DIAS))
    const slate = LEGENDA_MANUTENCAO.find((l) => l.cor === 'slate')
    expect(slate?.texto).toMatch(/Troca/)
  })

  it('legendas de estorno preservam a contagem (comunicação honesta do achado F16)', () => {
    expect(LEGENDA_ESTORNO).toMatch(/continua incluindo/i)
    expect(LEGENDA_ESTORNO_ITENS).toMatch(/continua incluindo/i)
    expect(LEGENDA_ESTORNO_ITENS).toMatch(/\(estorno\)/)
  })

  it('LEGENDA_TROCA diz que não é compra', () => {
    expect(LEGENDA_TROCA.toLowerCase()).toMatch(/não foi comprado|não é (uma )?compra/)
  })
})
