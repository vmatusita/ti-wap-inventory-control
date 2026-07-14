import { describe, it, expect } from 'vitest'
import {
  canonicalizarPatrimonio,
  parsearLista,
  expandirFaixa,
  chavePatrimonio,
  patrimoniosRepetidos,
  MAX_LOTE_COMPRA,
  PATRIMONIO_CANONICAL_RE,
} from '@/lib/patrimonio'

describe('canonicalizarPatrimonio', () => {
  it('completa com zeros à esquerda até 7 dígitos', () => {
    expect(canonicalizarPatrimonio('WAP4491')).toBe('WAP0004491')
  })

  it('normaliza caixa, espaços e hífens', () => {
    expect(canonicalizarPatrimonio('  wap-4491 ')).toBe('WAP0004491')
    expect(canonicalizarPatrimonio('WAP 000 4491')).toBe('WAP0004491')
  })

  it('mantém um patrimônio já canônico', () => {
    expect(canonicalizarPatrimonio('WAP0004491')).toBe('WAP0004491')
  })

  it('colapsa zeros à esquerda antes de repadronizar', () => {
    expect(canonicalizarPatrimonio('WAP0000001')).toBe('WAP0000001')
  })

  it('trata o caso todos-zeros como 0', () => {
    expect(canonicalizarPatrimonio('WAP0000000')).toBe('WAP0000000')
  })

  it('aceita prefixo de 2 a 4 letras', () => {
    expect(canonicalizarPatrimonio('AB1')).toBe('AB0000001')
    expect(canonicalizarPatrimonio('ABCD1')).toBe('ABCD0000001')
  })

  it('rejeita mais de 7 dígitos significativos', () => {
    expect(canonicalizarPatrimonio('WAP12345678')).toBeNull()
  })

  it('rejeita prefixo inválido (curto, longo ou ausente)', () => {
    expect(canonicalizarPatrimonio('W4491')).toBeNull()
    expect(canonicalizarPatrimonio('WAPXY4491')).toBeNull()
    expect(canonicalizarPatrimonio('4491')).toBeNull()
  })

  it('rejeita entrada vazia ou sem dígitos', () => {
    expect(canonicalizarPatrimonio('')).toBeNull()
    expect(canonicalizarPatrimonio('WAP')).toBeNull()
  })
})

describe('PATRIMONIO_CANONICAL_RE', () => {
  it('casa apenas o formato canônico (prefixo + 7 dígitos)', () => {
    expect(PATRIMONIO_CANONICAL_RE.test('WAP0004491')).toBe(true)
    expect(PATRIMONIO_CANONICAL_RE.test('WAP4491')).toBe(false)
    expect(PATRIMONIO_CANONICAL_RE.test('wap0004491')).toBe(false)
  })
})

describe('parsearLista', () => {
  it('lê patrimônios e service tag opcional após a vírgula', () => {
    const { itens, erros } = parsearLista('WAP4491\nWAP4492, ST9')
    expect(erros).toEqual([])
    expect(itens).toEqual([
      { patrimonio: 'WAP0004491', service_tag: undefined },
      { patrimonio: 'WAP0004492', service_tag: 'ST9' },
    ])
  })

  it('ignora linhas em branco e reporta as inválidas com o número da linha', () => {
    const { itens, erros } = parsearLista('WAP4491\n\nlixo')
    expect(itens).toHaveLength(1)
    expect(erros).toHaveLength(1)
    expect(erros[0].linha).toBe(3)
    expect(erros[0].texto).toBe('lixo')
  })
})

describe('expandirFaixa', () => {
  it('expande faixa inclusiva com o mesmo prefixo', () => {
    const r = expandirFaixa('WAP1', 'WAP3')
    expect(r.erro).toBeUndefined()
    expect(r.itens).toEqual(['WAP0000001', 'WAP0000002', 'WAP0000003'])
  })

  it('recusa prefixos diferentes', () => {
    const r = expandirFaixa('WAP1', 'DEL3')
    expect(r.itens).toBeUndefined()
    expect(r.erro).toMatch(/mesmo prefixo/i)
  })

  it('recusa quando o inicial é maior que o final', () => {
    const r = expandirFaixa('WAP5', 'WAP2')
    expect(r.erro).toBeDefined()
  })

  it(`recusa faixa acima do máximo de ${MAX_LOTE_COMPRA} por lote`, () => {
    const r = expandirFaixa('WAP1', `WAP${MAX_LOTE_COMPRA + 1}`)
    expect(r.itens).toBeUndefined()
    expect(r.erro).toContain(String(MAX_LOTE_COMPRA))
  })

  it('recusa patrimônio inicial/final inválido', () => {
    expect(expandirFaixa('lixo', 'WAP3').erro).toMatch(/inicial/i)
    expect(expandirFaixa('WAP1', 'lixo').erro).toMatch(/final/i)
  })
})

describe('chavePatrimonio (par único §5)', () => {
  it('combina patrimônio + service tag', () => {
    expect(chavePatrimonio('WAP0000001', 'ST9')).toBe('WAP0000001::ST9')
  })

  it('trata service tag ausente como string vazia (coalesce do banco)', () => {
    expect(chavePatrimonio('WAP0000001')).toBe('WAP0000001::')
    expect(chavePatrimonio('WAP0000001', null)).toBe('WAP0000001::')
  })

  it('distingue mesmo patrimônio com service tags diferentes', () => {
    expect(chavePatrimonio('WAP0000001', 'A')).not.toBe(chavePatrimonio('WAP0000001', 'B'))
  })
})

describe('patrimoniosRepetidos (repetição §5, por patrimônio só)', () => {
  it('devolve só os patrimônios que aparecem em mais de um item', () => {
    const r = patrimoniosRepetidos(['WAP1', 'WAP2', 'WAP1', 'WAP3', 'WAP3'])
    expect(r).toEqual(new Set(['WAP1', 'WAP3']))
  })

  it('devolve conjunto vazio quando não há repetição', () => {
    expect(patrimoniosRepetidos(['WAP1', 'WAP2'])).toEqual(new Set())
    expect(patrimoniosRepetidos([])).toEqual(new Set())
  })
})
