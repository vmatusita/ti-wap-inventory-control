import { describe, expect, it } from 'vitest'
import {
  LIMITE_LOTES_PARALELOS,
  mapComLimite,
  modeloDe,
  paginarPorIds,
  paginarTodos,
  ultimoPorAtivo,
} from './comum'

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

// Fonte falsa: um array que responde a (from,to) como o PostgREST responderia.
// `teto` é o `max-rows` DO SERVIDOR — quantas linhas ele topa devolver numa
// resposta, independente do tamanho da janela pedida. O padrão do Supabase é
// 1.000, mas é config de projeto: os testes abaixo exercitam os dois casos.
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
  it('lê tudo e confirma o fim com uma página vazia quando o conjunto é pequeno', async () => {
    const { chamadas, fazPagina } = fonte(7)
    const rows = await paginarTodos<{ i: number }>('rótulo', fazPagina)
    expect(rows).toHaveLength(7)
    // A segunda chamada é a CONFIRMAÇÃO de que acabou, e começa em 7 (o que o
    // servidor entregou), não em 1.000 (o que pedimos). Continua custando DUAS
    // chamadas mesmo com o critério novo (página menor que o teto observado):
    // a 1ª página (7 linhas) É o teto observado — ela o DEFINE, não o
    // confirma —, então nada nela distingue "acabou com 7" de "max-rows do
    // servidor é 7"; só a 2ª chamada, vazia, resolve a ambiguidade — ACHADO
    // 12, 19/08/2026 (revisão).
    expect(chamadas).toEqual([
      [0, 999],
      [7, 1006],
    ])
  })

  it('devolve vazio sem nenhuma página extra quando não há linha nenhuma', async () => {
    const { chamadas, fazPagina } = fonte(0)
    expect(await paginarTodos('rótulo', fazPagina)).toEqual([])
    expect(chamadas).toEqual([[0, 999]])
  })

  it('junta as páginas na ordem, sem repetir nem perder linha', async () => {
    // O caso real de produção: 1.648 ativos no as-of consolidado. Com o
    // critério novo, a 2ª página (648 linhas) já é ESTRITAMENTE MENOR que o
    // teto observado na 1ª (1.000) — isso sozinho prova o fim, sem precisar de
    // uma 3ª chamada vazia para confirmar. ACHADO 12, 19/08/2026 (revisão):
    // antes eram 3 chamadas ([0,999],[1000,1999],[1648,2647]); agora 2.
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

  it('lê tudo mesmo com o `max-rows` do servidor MENOR que a página pedida', async () => {
    // A regressão que o `rows.length < PAGINA → break` deixava passar: com
    // max-rows=500, TODA página vem curta. Parar na primeira devolveria 500 de
    // 2.500 — o corte silencioso de volta, agora disfarçado de paginação. É a
    // prova de segurança do critério novo (teto OBSERVADO, não hardcoded) —
    // ESTE CASO NÃO PODE REGREDIR, ACHADO 12, 19/08/2026 (revisão): como 500 é
    // múltiplo de 2.500, toda página real vem com o mesmo tamanho (500 == o
    // teto observado na 1ª), então só a página vazia final encerra — igual ao
    // comportamento anterior, mas agora dependente do teto observado, não de
    // `PAGINA`.
    const { chamadas, fazPagina } = fonte(2500, 500)
    const rows = await paginarTodos<{ i: number }>('rótulo', fazPagina)
    expect(rows).toHaveLength(2500)
    expect(rows.map((r) => r.i)).toEqual([...Array(2500).keys()])
    // Avança 500 por vez (o que o servidor entregou), não 1.000 (o que pedimos).
    expect(chamadas.map(([de]) => de)).toEqual([0, 500, 1000, 1500, 2000, 2500])
  })

  it('detecta o fim por página CURTA quando o total não é múltiplo do `max-rows`', async () => {
    // Trava a segurança do critério novo além do caso acima: max-rows=500 E um
    // total (1.250) que não é múltiplo de 500 — páginas 500, 500, 250. A
    // página de 250 já é estritamente menor que o teto observado (500) e
    // encerra a leitura SOZINHA, sem depender de uma página vazia extra.
    // ACHADO 12, 19/08/2026 (revisão).
    const { chamadas, fazPagina } = fonte(1250, 500)
    const rows = await paginarTodos<{ i: number }>('rótulo', fazPagina)
    expect(rows).toHaveLength(1250)
    expect(rows.map((r) => r.i)).toEqual([...Array(1250).keys()])
    expect(chamadas).toEqual([
      [0, 999],
      [500, 1499],
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

  it('LANÇA ao bater no teto de paginação em vez de devolver o acumulado', async () => {
    // Um cinto de segurança que corta dado calado é o mesmo bug num número
    // maior — e mais convincente, porque 100.000 não parece um número redondo
    // de API. A fonte é infinita de propósito.
    const { fazPagina } = fonte(Number.MAX_SAFE_INTEGER)
    await expect(paginarTodos('Falha ao ler o estoque', fazPagina)).rejects.toThrow(
      /teto de pagina[çc][ãa]o atingido \(100000 linhas\)/,
    )
  })

  it('lê exatamente o teto de paginação (100.000 linhas) SEM lançar', async () => {
    // ACHADO 6, 19/08/2026 (revisão): o teto é sobre o EXCEDENTE, não sobre o
    // total exato. Com o `>=` antigo, um acervo de EXATAMENTE 100.000 linhas
    // (100 páginas cheias de 1.000) fazia `from` chegar a 100.000 na última
    // página e `100000 >= 100000` lançava mesmo com a leitura completa e
    // correta — um acervo que coube certinho no teto virava exceção como se
    // tivesse estourado. `>` deixa esse caso concluir e ainda lança em
    // 100.001 (teste acima). Usa a `fonte()` normal — 100 páginas de objetos
    // triviais `{ i }` são baratas o bastante para não precisar de uma fonte
    // sintética à parte.
    const { chamadas, fazPagina } = fonte(100_000)
    const rows = await paginarTodos<{ i: number }>('rótulo', fazPagina)
    expect(rows).toHaveLength(100_000)
    // A última chamada é a confirmação vazia (o total é múltiplo exato do
    // teto observado, 1.000 — nenhuma página real vem curta para avisar).
    expect(chamadas.at(-1)).toEqual([100_000, 100_999])
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
    const rows = await paginarPorIds<{ id: string }>('rótulo', ids, (lote, from) => {
      if (from === 0) lotes.push(lote)
      return Promise.resolve({
        data: from === 0 ? lote.map((id) => ({ id })) : [],
        error: null,
      })
    })
    expect(lotes.map((l) => l.length)).toEqual([100, 100, 50])
    // A ordem do RESULTADO é a de `ids` mesmo com os lotes em voo ao mesmo
    // tempo: `partes.flat()` recompõe pelo índice do lote, não pela chegada.
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('dispara os lotes EM PARALELO, não um depois do outro', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    let emVoo = 0
    let picoEmVoo = 0
    const rows = await paginarPorIds<{ id: string }>('rótulo', ids, (lote, from) => {
      emVoo++
      picoEmVoo = Math.max(picoEmVoo, emVoo)
      return new Promise((resolve) =>
        setTimeout(() => {
          emVoo--
          resolve({ data: from === 0 ? lote.map((id) => ({ id })) : [], error: null })
        }, 0),
      )
    })
    expect(rows).toHaveLength(250)
    // Em série o pico seria 1. Os três lotes são independentes (nenhum id se
    // divide entre dois), então nada obriga a enfileirá-los. 3 lotes fica
    // ABAIXO de LIMITE_LOTES_PARALELOS (6, ACHADO 5, 19/08/2026 — revisão),
    // então o teto não entra em jogo aqui; o teste dele é o de baixo.
    expect(picoEmVoo).toBe(3)
  })

  it('trava o fan-out em LIMITE_LOTES_PARALELOS quando há mais lotes que o limite', async () => {
    // ACHADO 5, 19/08/2026 (revisão): 1.000 ids = 10 lotes de 100, acima do
    // teto (6) — sem ele, o snapshot de relatório somaria dezenas de
    // requisições PostgREST simultâneas por render contra o `db-pool` do
    // plano Free (ver o comentário "O TETO existe porque..." em comum.ts).
    const ids = Array.from({ length: 1000 }, (_, i) => `id-${i}`)
    let emVoo = 0
    let picoEmVoo = 0
    const rows = await paginarPorIds<{ id: string }>('rótulo', ids, (lote, from) => {
      emVoo++
      picoEmVoo = Math.max(picoEmVoo, emVoo)
      return new Promise((resolve) =>
        setTimeout(() => {
          emVoo--
          resolve({ data: from === 0 ? lote.map((id) => ({ id })) : [], error: null })
        }, 0),
      )
    })
    expect(rows).toHaveLength(1000)
    // A ordem do RESULTADO continua sendo a de `ids`, mesmo com o fan-out
    // limitado — `mapComLimite` grava cada parte no índice do lote, não na
    // ordem de conclusão.
    expect(rows.map((r) => r.id)).toEqual(ids)
    expect(picoEmVoo).toBeLessThanOrEqual(LIMITE_LOTES_PARALELOS)
    // E o teto é de fato ALCANÇADO — não é só "nunca estoura": com 10 lotes
    // disponíveis para 6 vagas, um limite acidentalmente menor (ex.: 1, que
    // reduziria a série) passaria despercebido só com o `toBeLessThanOrEqual`
    // acima.
    expect(picoEmVoo).toBe(LIMITE_LOTES_PARALELOS)
  })

  it('pagina DENTRO de cada lote — um id pode ter muitas linhas', async () => {
    // 100 ids num lote, mas 1.200 linhas: sem paginar por dentro, 200 sumiriam.
    // Cada lote pagina internamente com `paginarTodos`: a 2ª página (200
    // linhas) já vem estritamente menor que o teto observado na 1ª (1.000) e
    // encerra sozinha — ACHADO 12, 19/08/2026 (revisão). Antes eram 3 pedidos
    // ([0,999],[1000,1999],[1200,2199]); agora 2.
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

// `mapComLimite` já é exercitado por dentro de `paginarPorIds` acima, mas é
// contrato PRÓPRIO e exportado — outro módulo (dev-destrutivo.ts) o chama
// direto, sem passar por `paginarPorIds` — então merece testes que travem a
// assinatura sozinha, isolados de qualquer coisa de paginação. ACHADO 5,
// 19/08/2026 (revisão).
describe('mapComLimite', () => {
  it('nunca deixa mais que `limite` chamadas em voo ao mesmo tempo', async () => {
    let emVoo = 0
    let picoEmVoo = 0
    const itens = Array.from({ length: 20 }, (_, i) => i)
    const resultados = await mapComLimite(itens, 4, async (item) => {
      emVoo++
      picoEmVoo = Math.max(picoEmVoo, emVoo)
      await new Promise((resolve) => setTimeout(resolve, 0))
      emVoo--
      return item * 10
    })
    expect(picoEmVoo).toBe(4)
    expect(resultados).toEqual(itens.map((i) => i * 10))
  })

  it('devolve na ordem de ENTRADA, não na ordem de conclusão', async () => {
    // O item 0 é o mais LENTO de propósito — se o resultado saísse na ordem
    // de conclusão, ele apareceria por último, não primeiro.
    const atrasos = [30, 0, 20, 0, 10, 0]
    const resultados = await mapComLimite(atrasos, 3, async (atraso, indice) => {
      await new Promise((resolve) => setTimeout(resolve, atraso))
      return indice
    })
    expect(resultados).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('um item lento não atrasa os que vêm depois dele na fila', async () => {
    // Fila lógica (não lotes fixos): assim que um trabalhador termina, ele
    // puxa o PRÓXIMO item livre — um item 0 lento não prende um "companheiro
    // de lote" ocioso enquanto há itens 4+ esperando.
    const ordemDeInicio: number[] = []
    const atrasos = [50, 0, 0, 0, 0, 0]
    await mapComLimite(atrasos, 2, async (atraso, indice) => {
      ordemDeInicio.push(indice)
      await new Promise((resolve) => setTimeout(resolve, atraso))
      return indice
    })
    // Os 2 primeiros (0 e 1) começam juntos; assim que o 1 (instantâneo)
    // termina, o trabalhador dele puxa o 2 sem esperar o 0 (que ainda demora
    // 50ms) — nunca fica ocioso com item pendente.
    expect(ordemDeInicio.slice(0, 2)).toEqual([0, 1])
    expect(ordemDeInicio).toHaveLength(6)
  })

  it('rejeição de um item rejeita o todo, com a mensagem original', async () => {
    // "Sem promise órfã" aqui é testado indiretamente: se houvesse uma
    // rejeição fora de um await/all, o processo Node derrubaria o worker de
    // teste (o comentário longo de snapshot.ts explica o mecanismo) — o teste
    // sequer chegaria a este `await expect(...).rejects`.
    await expect(
      mapComLimite([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error('falhou no item 2')
        await new Promise((resolve) => setTimeout(resolve, 0))
        return item
      }),
    ).rejects.toThrow('falhou no item 2')
  })

  it('depois da rejeição, NENHUM trabalho novo começa (fail-fast do pool)', async () => {
    // O pool tem fila pendente quando o erro acontece — diferente do
    // `Promise.all` irrestrito, em que tudo já tinha sido disparado no instante
    // zero. Sem o `abortado`, os trabalhadores sobreviventes seguiriam puxando
    // itens e ABRINDO conexões novas com o banco DEPOIS de o chamador já ter
    // recebido o erro: gastando justamente o `db-pool` que o teto existe para
    // proteger. O item 1 falha na hora; o item 0 é lento e, ao terminar, não
    // pode puxar o item 2.
    const iniciados: number[] = []
    await expect(
      mapComLimite([0, 1, 2, 3, 4], 2, async (_item, indice) => {
        iniciados.push(indice)
        if (indice === 1) throw new Error('falhou no item 1')
        await new Promise((resolve) => setTimeout(resolve, 20))
        return indice
      }),
    ).rejects.toThrow('falhou no item 1')
    // Folga para o trabalhador lento terminar e (indevidamente) puxar mais.
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(iniciados).toEqual([0, 1])
  })

  it('lista vazia devolve vazio sem chamar `fn`', async () => {
    let chamou = false
    const resultados = await mapComLimite([], 6, async () => {
      chamou = true
      return 0
    })
    expect(resultados).toEqual([])
    expect(chamou).toBe(false)
  })

  it('funciona com menos itens que o limite (não cria trabalhador ocioso)', async () => {
    const resultados = await mapComLimite([1, 2, 3], LIMITE_LOTES_PARALELOS, async (item) => item)
    expect(resultados).toEqual([1, 2, 3])
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
