import { describe, expect, it } from 'vitest'
import {
  COLUNAS_ORDENAVEIS,
  TAMANHOS_PAGINA,
  TAMANHO_PAGINA_PADRAO,
  ehColunaOrdenavel,
  ehTamanhoPagina,
  parseOrdenacao,
  parseTamanhoPagina,
  proximaDirecao,
  serializarOrdenacao,
} from '@/lib/ativos/lista'

// T7 (F11) — a ordenação e o tamanho de página vivem na URL, ou seja, são
// entrada de usuário. O contrato é: param torto NUNCA derruba a tela, só cai no
// default. Estes testes são a rede dessa promessa.
describe('parseOrdenacao', () => {
  it('aceita uma coluna da whitelist em asc', () => {
    expect(parseOrdenacao('patrimonio.asc')).toEqual({
      coluna: 'patrimonio',
      direcao: 'asc',
    })
  })

  it('aceita uma coluna da whitelist em desc', () => {
    expect(parseOrdenacao('modelo.desc')).toEqual({
      coluna: 'modelo',
      direcao: 'desc',
    })
  })

  it('aceita todas as colunas da whitelist, nas duas direções', () => {
    for (const coluna of COLUNAS_ORDENAVEIS) {
      expect(parseOrdenacao(`${coluna}.asc`)).toEqual({ coluna, direcao: 'asc' })
      expect(parseOrdenacao(`${coluna}.desc`)).toEqual({
        coluna,
        direcao: 'desc',
      })
    }
  })

  it('ignora coluna fora da whitelist', () => {
    expect(parseOrdenacao('marca.asc')).toBeNull()
    expect(parseOrdenacao('filial_nome.asc')).toBeNull()
    expect(parseOrdenacao('service_tag.desc')).toBeNull()
    expect(parseOrdenacao('updated_at.desc')).toBeNull()
  })

  it('ignora coluna que não é coluna (tentativa de injeção)', () => {
    expect(parseOrdenacao('id;drop.asc')).toBeNull()
    expect(parseOrdenacao('patrimonio,id.asc')).toBeNull()
  })

  it('ignora direção inválida', () => {
    expect(parseOrdenacao('status.crescente')).toBeNull()
    expect(parseOrdenacao('status.ASC')).toBeNull()
    expect(parseOrdenacao('status.')).toBeNull()
  })

  it('ignora string vazia e só espaços', () => {
    expect(parseOrdenacao('')).toBeNull()
    expect(parseOrdenacao('   ')).toBeNull()
  })

  it('ignora undefined e null', () => {
    expect(parseOrdenacao(undefined)).toBeNull()
    expect(parseOrdenacao(null)).toBeNull()
  })

  it('ignora param repetido na URL (searchParams devolve array)', () => {
    expect(parseOrdenacao(['status.asc', 'modelo.desc'])).toBeNull()
  })

  it('ignora lixo com pontos a mais ou de menos', () => {
    expect(parseOrdenacao('status.asc.desc')).toBeNull()
    expect(parseOrdenacao('status')).toBeNull()
    expect(parseOrdenacao('.')).toBeNull()
    expect(parseOrdenacao('..')).toBeNull()
    expect(parseOrdenacao('.asc')).toBeNull()
  })

  it('tolera espaço nas pontas (link colado de um e-mail)', () => {
    expect(parseOrdenacao(' status.asc ')).toEqual({
      coluna: 'status',
      direcao: 'asc',
    })
  })

  it('faz ida e volta com serializarOrdenacao', () => {
    const ordenacao = { coluna: 'colaborador_atual', direcao: 'desc' } as const
    expect(parseOrdenacao(serializarOrdenacao(ordenacao))).toEqual(ordenacao)
  })
})

describe('ehColunaOrdenavel', () => {
  it('reconhece só o que está na whitelist', () => {
    expect(ehColunaOrdenavel('categoria')).toBe(true)
    expect(ehColunaOrdenavel('marca')).toBe(false)
    expect(ehColunaOrdenavel(undefined)).toBe(false)
    expect(ehColunaOrdenavel(7)).toBe(false)
  })

  it('não confunde propriedade herdada de Object com coluna', () => {
    expect(ehColunaOrdenavel('toString')).toBe(false)
    expect(ehColunaOrdenavel('constructor')).toBe(false)
  })
})

describe('proximaDirecao (ciclo do cabeçalho)', () => {
  it('vai de nada → asc → desc → nada', () => {
    expect(proximaDirecao(null)).toBe('asc')
    expect(proximaDirecao('asc')).toBe('desc')
    expect(proximaDirecao('desc')).toBeNull()
  })
})

describe('parseTamanhoPagina', () => {
  it('aceita os tamanhos oferecidos', () => {
    for (const t of TAMANHOS_PAGINA) {
      expect(parseTamanhoPagina(String(t))).toBe(t)
    }
  })

  it('recusa tamanho fora da lista', () => {
    expect(parseTamanhoPagina('10')).toBeNull()
    expect(parseTamanhoPagina('51')).toBeNull()
    expect(parseTamanhoPagina('100000')).toBeNull()
    expect(parseTamanhoPagina('0')).toBeNull()
  })

  it('recusa lixo, vazio, negativo e não-string', () => {
    expect(parseTamanhoPagina('abc')).toBeNull()
    expect(parseTamanhoPagina('')).toBeNull()
    expect(parseTamanhoPagina('-50')).toBeNull()
    expect(parseTamanhoPagina('50.5')).toBeNull()
    expect(parseTamanhoPagina(undefined)).toBeNull()
    expect(parseTamanhoPagina(50)).toBeNull()
    expect(parseTamanhoPagina(['50', '100'])).toBeNull()
  })

  it('tolera espaço nas pontas', () => {
    expect(parseTamanhoPagina(' 25 ')).toBe(25)
  })

  it('o padrão do projeto é um dos tamanhos oferecidos', () => {
    expect(ehTamanhoPagina(TAMANHO_PAGINA_PADRAO)).toBe(true)
  })
})
