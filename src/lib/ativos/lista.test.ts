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
  rotuloSubtitulo,
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

// F27/B5 (ATV-05) — o subtítulo não pode afirmar "cadastrados" (verdade GLOBAL)
// sobre um `total` que já veio filtrado/recortado. Três ramos, na mesma
// prioridade de `vazioFiltrado` (ativos/page.tsx), mais a concordância
// singular/plural do particípio.
describe('rotuloSubtitulo', () => {
  it('com filtro, devolve "encontrados" (plural) mesmo se também há recorte de filial', () => {
    expect(
      rotuloSubtitulo({ total: 37, temFiltro: true, temRecorteFilial: false }),
    ).toBe('37 encontrados')
    // Operador filtrou explicitamente por UMA das filiais dele: os dois booleanos
    // vêm true (a escolha explícita também conta como recorte), e o filtro
    // explícito vence — mesma prioridade de `vazioFiltrado`.
    expect(
      rotuloSubtitulo({ total: 4, temFiltro: true, temRecorteFilial: true }),
    ).toBe('4 encontrados')
  })

  it('com filtro e total = 1, concorda no singular: "encontrado"', () => {
    expect(
      rotuloSubtitulo({ total: 1, temFiltro: true, temRecorteFilial: false }),
    ).toBe('1 encontrado')
  })

  it('só recorte de cargo (sem filtro na URL), devolve "nas suas filiais"', () => {
    expect(
      rotuloSubtitulo({ total: 1204, temFiltro: false, temRecorteFilial: true }),
    ).toBe('1.204 nas suas filiais')
  })

  it('repouso — sem filtro nem recorte — devolve "cadastrados" (verdade global)', () => {
    expect(
      rotuloSubtitulo({ total: 1597, temFiltro: false, temRecorteFilial: false }),
    ).toBe('1.597 cadastrados')
  })

  it('repouso com total = 1, concorda no singular: "cadastrado"', () => {
    expect(
      rotuloSubtitulo({ total: 1, temFiltro: false, temRecorteFilial: false }),
    ).toBe('1 cadastrado')
  })

  it('zero é plural em pt-BR: "0 encontrados" / "0 cadastrados"', () => {
    expect(
      rotuloSubtitulo({ total: 0, temFiltro: true, temRecorteFilial: false }),
    ).toBe('0 encontrados')
    expect(
      rotuloSubtitulo({ total: 0, temFiltro: false, temRecorteFilial: false }),
    ).toBe('0 cadastrados')
  })

  it('formata milhar com separador pt-BR', () => {
    expect(
      rotuloSubtitulo({ total: 12345, temFiltro: false, temRecorteFilial: false }),
    ).toBe('12.345 cadastrados')
  })
})
