import { describe, expect, it } from 'vitest'
import { modeloDe, paginarPorIds, paginarTodos, ultimoPorAtivo } from './comum'

// A paginação do PostgREST não tinha teste — e é ela que separa "li o acervo
// inteiro" de "li os primeiros 1.000 e não avisei ninguém". O corte de 1.000
// linhas do PostgREST derrubou o comparativo do relatório em produção
// (17/08/2026): o total anterior parava em 1.000 e o Δ anunciava centenas de
// ativos que nunca entraram.
//
// O repositório testa só funções puras e não tem convenção de mock de builder
// encadeado do Supabase. Estes testes respeitam isso: `paginarTodos` recebe um
// CALLBACK de página, e é o callback que se simula — nenhuma parte do
// supabase-js entra aqui.

// Fonte falsa: um array que responde a (from,to) como o PostgREST responderia,
// inclusive o teto de 1.000 por página.
function fonte(total: number, teto = 1000) {
  const chamadas: [number, number][] = []
  const fazPagina = (from: number, to: number) => {
    chamadas.push([from, to])
    const fim = Math.min(to + 1, from + teto, total)
    const data = []
    for (let i = from; i < fim; i++) data.push({ i })
    return Promise.resolve({ data, error: null })
  }
  return { chamadas, fazPagina }
}

describe('paginarTodos', () => {
  it('lê tudo numa página só quando o conjunto é menor que a página', async () => {
    const { chamadas, fazPagina } = fonte(7)
    const rows = await paginarTodos<{ i: number }>('rótulo', fazPagina)
    expect(rows).toHaveLength(7)
    expect(chamadas).toEqual([[0, 999]])
  })

  it('devolve vazio sem nenhuma página extra quando não há linha nenhuma', async () => {
    const { chamadas, fazPagina } = fonte(0)
    expect(await paginarTodos('rótulo', fazPagina)).toEqual([])
    expect(chamadas).toEqual([[0, 999]])
  })

  it('junta as páginas na ordem, sem repetir nem perder linha', async () => {
    // O caso real de produção: 1.648 ativos no as-of consolidado.
    const { chamadas, fazPagina } = fonte(1648)
    const rows = await paginarTodos<{ i: number }>('rótulo', fazPagina)
    expect(rows).toHaveLength(1648)
    expect(rows.map((r) => r.i)).toEqual([...Array(1648).keys()])
    expect(chamadas).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('pede a página seguinte quando a anterior veio EXATAMENTE cheia', async () => {
    // A armadilha: 1.000 linhas é indistinguível de "acabou em 1.000" sem uma
    // segunda leitura. Parar aqui é exatamente o bug que esta correção conserta.
    const { chamadas, fazPagina } = fonte(1000)
    const rows = await paginarTodos<{ i: number }>('rótulo', fazPagina)
    expect(rows).toHaveLength(1000)
    expect(chamadas).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('trata `data` nulo como fim da paginação, não como erro', async () => {
    const rows = await paginarTodos('rótulo', () =>
      Promise.resolve({ data: null, error: null }),
    )
    expect(rows).toEqual([])
  })

  it('lança com o rótulo quando uma página FALHA — inclusive a segunda', async () => {
    let n = 0
    const fazPagina = (from: number, to: number) => {
      n++
      if (n === 1) {
        const data = []
        for (let i = from; i <= to; i++) data.push({ i })
        return Promise.resolve({ data, error: null })
      }
      return Promise.resolve({ data: null, error: { message: 'timeout' } })
    }
    // Falhar alto: devolver as 1.000 da primeira página seria afirmar um número
    // errado com cara de certo.
    await expect(paginarTodos('Falha ao ler o estoque', fazPagina)).rejects.toThrow(
      'Falha ao ler o estoque: timeout',
    )
  })
})

describe('paginarPorIds', () => {
  it('não chama o banco quando a lista de ids está vazia', async () => {
    let chamou = false
    const rows = await paginarPorIds('rótulo', [], () => {
      chamou = true
      return Promise.resolve({ data: [], error: null })
    })
    expect(rows).toEqual([])
    expect(chamou).toBe(false)
  })

  it('quebra a lista em lotes de 100 e concatena na ordem dos ids', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    const lotes: string[][] = []
    const rows = await paginarPorIds<{ id: string }>('rótulo', ids, (lote) => {
      lotes.push(lote)
      return Promise.resolve({ data: lote.map((id) => ({ id })), error: null })
    })
    expect(lotes.map((l) => l.length)).toEqual([100, 100, 50])
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('pagina DENTRO de cada lote — um id pode ter muitas linhas', async () => {
    // 100 ids num lote, mas 1.200 linhas: sem paginar por dentro, 200 sumiriam.
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`)
    const pedidos: [number, number][] = []
    const rows = await paginarPorIds<{ i: number }>('rótulo', ids, (_lote, from, to) => {
      pedidos.push([from, to])
      const fim = Math.min(to + 1, 1200)
      const data = []
      for (let i = from; i < fim; i++) data.push({ i })
      return Promise.resolve({ data, error: null })
    })
    expect(rows).toHaveLength(1200)
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('propaga a falha de um lote com o rótulo', async () => {
    await expect(
      paginarPorIds('Falha ao ler ativos', ['a'], () =>
        Promise.resolve({ data: null, error: { message: 'sem rede' } }),
      ),
    ).rejects.toThrow('Falha ao ler ativos: sem rede')
  })
})

describe('ultimoPorAtivo', () => {
  it('guarda o PRIMEIRO valor visto de cada ativo (as linhas já chegam ordenadas)', () => {
    const rows = [
      { a: 'x', v: 'novo' },
      { a: 'x', v: 'velho' },
      { a: 'y', v: 'unico' },
    ]
    const m = ultimoPorAtivo(
      rows,
      (r) => r.a,
      (r) => r.v,
    )
    expect(m.get('x')).toBe('novo')
    expect(m.get('y')).toBe('unico')
  })

  it('atravessa a fronteira dos lotes: um ativo nunca se divide entre dois', () => {
    // É a invariante que deixa `paginarPorIds` ordenar dentro do lote sem
    // estragar o desempate — o `.in()` agrupa por id, e cada id vive num lote só.
    const lote1 = [{ a: 'x', v: 'recente' }, { a: 'x', v: 'antigo' }]
    const lote2 = [{ a: 'y', v: 'recente-y' }]
    const m = ultimoPorAtivo(
      [...lote1, ...lote2],
      (r) => r.a,
      (r) => r.v,
    )
    expect(m.get('x')).toBe('recente')
    expect(m.get('y')).toBe('recente-y')
  })
})

describe('modeloDe', () => {
  it('junta marca e modelo, e cai em "Sem modelo" quando não há nada', () => {
    expect(modeloDe('Dell', 'Latitude 5440')).toBe('Dell Latitude 5440')
    expect(modeloDe(null, 'Latitude')).toBe('Latitude')
    expect(modeloDe('Dell', null)).toBe('Dell')
    expect(modeloDe(null, null)).toBe('Sem modelo')
    expect(modeloDe('  ', '')).toBe('Sem modelo')
  })
})
