import { describe, it, expect } from 'vitest'
import {
  canonicalizarPatrimonio,
  parsearLista,
  duplicatasDaLista,
  expandirFaixa,
  parearFaixaComServiceTags,
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
      { patrimonio: 'WAP0004491', service_tag: undefined, linha: 1 },
      { patrimonio: 'WAP0004492', service_tag: 'ST9', linha: 2 },
    ])
  })

  it('ignora linhas em branco e reporta as inválidas com o número da linha', () => {
    const { itens, erros } = parsearLista('WAP4491\n\nlixo')
    expect(itens).toHaveLength(1)
    expect(erros).toHaveLength(1)
    expect(erros[0].linha).toBe(3)
    expect(erros[0].texto).toBe('lixo')
  })

  it('aceita ponto e vírgula como separador da service tag', () => {
    const { itens, erros } = parsearLista('WAP0001234;ST-ABC123')
    expect(erros).toEqual([])
    expect(itens).toEqual([
      { patrimonio: 'WAP0001234', service_tag: 'ST-ABC123', linha: 1 },
    ])
  })

  it('aceita TAB como separador (colar duas colunas do Excel)', () => {
    const { itens, erros } = parsearLista(
      'WAP0001234\tST-ABC123\nWAP0001235\tST-DEF456',
    )
    expect(erros).toEqual([])
    expect(itens).toEqual([
      { patrimonio: 'WAP0001234', service_tag: 'ST-ABC123', linha: 1 },
      { patrimonio: 'WAP0001235', service_tag: 'ST-DEF456', linha: 2 },
    ])
  })

  it('tolera espaços em volta do TAB', () => {
    const { itens, erros } = parsearLista('  WAP0001234 \t  ST-ABC123  ')
    expect(erros).toEqual([])
    expect(itens).toEqual([
      { patrimonio: 'WAP0001234', service_tag: 'ST-ABC123', linha: 1 },
    ])
  })

  it('acusa erro na linha com mais de 2 colunas (nada é descartado em silêncio)', () => {
    const { itens, erros } = parsearLista(
      'WAP0001234\tST-ABC123\tNotebook do Fulano',
    )
    expect(itens).toEqual([])
    expect(erros).toHaveLength(1)
    expect(erros[0].linha).toBe(1)
    expect(erros[0].msg).toMatch(/mais de 2 colunas/i)
  })

  it('ignora separador solto no fim da linha (coluna vazia do Excel)', () => {
    const { itens, erros } = parsearLista('WAP0001234\t\nWAP0001235,')
    expect(erros).toEqual([])
    expect(itens).toEqual([
      { patrimonio: 'WAP0001234', service_tag: undefined, linha: 1 },
      { patrimonio: 'WAP0001235', service_tag: undefined, linha: 2 },
    ])
  })

  it('aceita linha só com o patrimônio', () => {
    const { itens, erros } = parsearLista('WAP0001234')
    expect(erros).toEqual([])
    expect(itens).toEqual([
      { patrimonio: 'WAP0001234', service_tag: undefined, linha: 1 },
    ])
  })
})

describe('duplicatasDaLista (A3 — duplicidade dentro da lista colada)', () => {
  it('acusa as DUAS ocorrências com o número de linha original', () => {
    // Linha 2 em branco e linha 3 inválida NÃO podem deslocar a numeração.
    const { itens } = parsearLista(
      'WAP0001234\n\nlixo\nWAP0001235\nWAP0001234',
    )
    const dups = duplicatasDaLista(itens)
    expect(dups).toHaveLength(1)
    expect(dups[0].patrimonio).toBe('WAP0001234')
    expect(dups[0].chave).toBe(chavePatrimonio('WAP0001234'))
    expect(dups[0].linhas).toEqual([1, 5])
  })

  it('acusa a repetição do PAR patrimônio + service tag', () => {
    const { itens } = parsearLista(
      'WAP0001234\tST-ABC123\nWAP0001234\tST-ABC123',
    )
    const dups = duplicatasDaLista(itens)
    expect(dups).toHaveLength(1)
    expect(dups[0].service_tag).toBe('ST-ABC123')
    expect(dups[0].linhas).toEqual([1, 2])
  })

  it('não acusa o mesmo patrimônio com service tags diferentes (§5)', () => {
    const { itens } = parsearLista(
      'WAP0001234\tST-ABC123\nWAP0001234\tST-DEF456',
    )
    expect(duplicatasDaLista(itens)).toEqual([])
  })

  it('devolve vazio para lista limpa ou vazia', () => {
    const { itens } = parsearLista('WAP0001234\nWAP0001235')
    expect(duplicatasDaLista(itens)).toEqual([])
    expect(duplicatasDaLista([])).toEqual([])
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

describe('parearFaixaComServiceTags (A2 — service tags no modo Faixa)', () => {
  const faixa = expandirFaixa('WAP1234', 'WAP1236').itens ?? []

  it('pareia patrimônio e service tag na ordem da faixa', () => {
    const r = parearFaixaComServiceTags(faixa, 'ST-ABC123\nST-DEF456\nST-GHI789')
    expect(r.erro).toBeUndefined()
    expect(r.itens).toEqual([
      { patrimonio: 'WAP0001234', service_tag: 'ST-ABC123' },
      { patrimonio: 'WAP0001235', service_tag: 'ST-DEF456' },
      { patrimonio: 'WAP0001236', service_tag: 'ST-GHI789' },
    ])
  })

  it('texto vazio (ou só espaços) = faixa sem service tags, como antes da F10', () => {
    expect(parearFaixaComServiceTags(faixa, '').itens).toEqual([
      { patrimonio: 'WAP0001234' },
      { patrimonio: 'WAP0001235' },
      { patrimonio: 'WAP0001236' },
    ])
    expect(parearFaixaComServiceTags(faixa, '  \n \n').itens).toHaveLength(3)
  })

  it('acusa contagem diferente citando os dois números', () => {
    const r = parearFaixaComServiceTags(faixa, 'ST-ABC123\nST-DEF456')
    expect(r.itens).toBeUndefined()
    expect(r.erro).toContain('3 patrimônios')
    expect(r.erro).toContain('2 service tags')
  })

  it('ignora linhas em branco no meio e apara espaços da service tag', () => {
    const r = parearFaixaComServiceTags(faixa, '  ST-ABC123  \n\nST-DEF456\n \nST-GHI789\n')
    expect(r.erro).toBeUndefined()
    expect(r.itens?.map((i) => i.service_tag)).toEqual([
      'ST-ABC123',
      'ST-DEF456',
      'ST-GHI789',
    ])
  })

  it('recusa service tag repetida (o índice único do banco não pegaria)', () => {
    const r = parearFaixaComServiceTags(faixa, 'ST-ABC123\nST-DEF456\nst-abc123')
    expect(r.itens).toBeUndefined()
    expect(r.erro).toMatch(/repetida/i)
    expect(r.erro).toContain('linhas 1 e 3')
  })

  it('singulariza a mensagem com um patrimônio só', () => {
    const r = parearFaixaComServiceTags(['WAP0001234'], 'ST-ABC123\nST-DEF456')
    expect(r.erro).toContain('1 patrimônio ×')
    expect(r.erro).toContain('2 service tags')
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
