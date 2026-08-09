import { describe, expect, it } from 'vitest'
import {
  AVISO_ESTORNO_PERNA_TRANSFERENCIA,
  PREFIXO_TRANSFERENCIA_ENTRADA,
  PREFIXO_TRANSFERENCIA_SAIDA,
  ehPernaDeTransferencia,
  erroQuantidadeAcimaDoSaldo,
  observacoesDaTransferencia,
} from '@/lib/itens/transferencia'

describe('observacoesDaTransferencia (F31 · ITN-01)', () => {
  it('nomeia a OUTRA ponta em cada perna — não a própria', () => {
    const o = observacoesDaTransferencia('Matriz', 'Serra')
    expect(o.origem).toBe('Transferência para Serra')
    expect(o.destino).toBe('Transferência de Matriz')
  })

  it('a observação do operador entra DEPOIS da frase automática, nas duas', () => {
    const o = observacoesDaTransferencia('Matriz', 'Serra', 'Estoque de giro')
    expect(o.origem).toBe('Transferência para Serra — Estoque de giro')
    expect(o.destino).toBe('Transferência de Matriz — Estoque de giro')
  })

  it('observação vazia, só espaços ou ausente não deixa travessão órfão', () => {
    for (const vazia of ['', '   ', null, undefined]) {
      const o = observacoesDaTransferencia('Matriz', 'Serra', vazia)
      expect(o.origem).toBe('Transferência para Serra')
      expect(o.destino).toBe('Transferência de Matriz')
    }
  })

  it('as duas nunca ficam vazias — é o CHECK lanc_item_ajuste_obs que depende disso', () => {
    const o = observacoesDaTransferencia('  ', '  ')
    expect(o.origem.trim().length).toBeGreaterThan(0)
    expect(o.destino.trim().length).toBeGreaterThan(0)
  })
})

describe('ehPernaDeTransferencia (selo de APRESENTAÇÃO do histórico)', () => {
  it('reconhece as duas pernas que a própria composição gera', () => {
    const o = observacoesDaTransferencia('Matriz', 'Serra', 'Estoque de giro')
    expect(ehPernaDeTransferencia('ajuste', o.origem)).toBe('saida')
    expect(ehPernaDeTransferencia('ajuste', o.destino)).toBe('entrada')
  })

  it('só vale para ajuste — o único tipo que a transferência grava', () => {
    const o = observacoesDaTransferencia('Matriz', 'Serra')
    expect(ehPernaDeTransferencia('entrada', o.destino)).toBeNull()
    expect(ehPernaDeTransferencia('saida', o.origem)).toBeNull()
    expect(ehPernaDeTransferencia('retorno', o.destino)).toBeNull()
  })

  it('ajuste comum não acende o selo', () => {
    expect(ehPernaDeTransferencia('ajuste', 'Contagem do inventário de agosto')).toBeNull()
    expect(ehPernaDeTransferencia('ajuste', null)).toBeNull()
    expect(ehPernaDeTransferencia('ajuste', '')).toBeNull()
  })

  it('não confunde as duas pernas entre si (os prefixos são distintos)', () => {
    expect(PREFIXO_TRANSFERENCIA_SAIDA).not.toBe(PREFIXO_TRANSFERENCIA_ENTRADA)
    expect(ehPernaDeTransferencia('ajuste', `${PREFIXO_TRANSFERENCIA_SAIDA}Serra`)).toBe('saida')
    expect(ehPernaDeTransferencia('ajuste', `${PREFIXO_TRANSFERENCIA_ENTRADA}Serra`)).toBe('entrada')
  })

  it('tolera espaço à esquerda (o texto viaja por banco e CSV)', () => {
    expect(ehPernaDeTransferencia('ajuste', '  Transferência para Serra')).toBe('saida')
  })

  it('tipo ausente/lixo não acende nada', () => {
    expect(ehPernaDeTransferencia(null, 'Transferência para Serra')).toBeNull()
    expect(ehPernaDeTransferencia(undefined, 'Transferência de Matriz')).toBeNull()
    expect(ehPernaDeTransferencia('constructor', 'Transferência de Matriz')).toBeNull()
  })
})

describe('erroQuantidadeAcimaDoSaldo (segunda linha; o juiz é o trigger)', () => {
  it('acusa acima do saldo, com o número da origem', () => {
    expect(erroQuantidadeAcimaDoSaldo(15, 14)).toBe('Só há 14 na filial de origem.')
  })

  it('igual ao saldo passa — o estoque pode ir a zero', () => {
    expect(erroQuantidadeAcimaDoSaldo(14, 14)).toBeNull()
  })

  it('saldo desconhecido nunca recusa (nada de acusar por número que não se tem)', () => {
    expect(erroQuantidadeAcimaDoSaldo(15, null)).toBeNull()
    expect(erroQuantidadeAcimaDoSaldo(15, undefined)).toBeNull()
    expect(erroQuantidadeAcimaDoSaldo(15, Number.NaN)).toBeNull()
  })

  it('quantidade ainda não digitada não é problema de saldo (o Zod cobre)', () => {
    expect(erroQuantidadeAcimaDoSaldo(Number.NaN, 3)).toBeNull()
    expect(erroQuantidadeAcimaDoSaldo(0, 3)).toBeNull()
    expect(erroQuantidadeAcimaDoSaldo(-2, 3)).toBeNull()
  })

  it('saldo zero recusa qualquer quantidade positiva', () => {
    expect(erroQuantidadeAcimaDoSaldo(1, 0)).toBe('Só há 0 na filial de origem.')
  })
})

describe('o aviso do estorno de perna diz o efeito, não só que "cuidado"', () => {
  it('nomeia o lado único, o total consolidado e o caminho certo', () => {
    expect(AVISO_ESTORNO_PERNA_TRANSFERENCIA).toContain('só ESTE lado')
    expect(AVISO_ESTORNO_PERNA_TRANSFERENCIA).toContain('total consolidado')
    expect(AVISO_ESTORNO_PERNA_TRANSFERENCIA).toContain('sentido contrário')
  })
})
