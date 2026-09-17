import { describe, expect, it } from 'vitest'
import { paginarTodos } from '@/lib/queries/relatorios/comum'
import {
  TETO_LINHAS_TABELA,
  corteComTotal,
  decidirCorte,
  janelaAteOLimite,
  montarTabelasTruncadas,
  paginaAteOLimite,
  totalDaTabela,
} from '@/lib/relatorios/teto-tabela'

// F60 (fato 16 · PLAN-F60 §10, decisão 6) — o teto das três tabelas do relatório, na metade PURA.
// Linhas 100% fictícias: índices, nenhum patrimônio nem pessoa.

const linhas = (n: number) => Array.from({ length: n }, (_, i) => ({ i }))

describe('TETO_LINHAS_TABELA', () => {
  it('é 2.000 — ~13× a maior tabela medida em produção em 365 dias (155, PLAN-F60 §3.5 B5)', () => {
    expect(TETO_LINHAS_TABELA).toBe(2_000)
    expect(TETO_LINHAS_TABELA / 155).toBeGreaterThan(12)
  })
})

describe('decidirCorte — a decisão sobre o que a leitura trouxe', () => {
  it('teto − 1: todas ficam, sem corte', () => {
    const r = decidirCorte(linhas(TETO_LINHAS_TABELA - 1), TETO_LINHAS_TABELA)
    expect(r.cortou).toBe(false)
    expect(r.linhas).toHaveLength(TETO_LINHAS_TABELA - 1)
  })

  it('teto EXATO: todas ficam, sem corte — caber certinho no teto não é passar dele', () => {
    const r = decidirCorte(linhas(TETO_LINHAS_TABELA), TETO_LINHAS_TABELA)
    expect(r.cortou).toBe(false)
    expect(r.linhas).toHaveLength(TETO_LINHAS_TABELA)
  })

  it('teto + 1: corta nas `teto` PRIMEIRAS (as mais recentes, pela ordem da consulta)', () => {
    const r = decidirCorte(linhas(TETO_LINHAS_TABELA + 1), TETO_LINHAS_TABELA)
    expect(r.cortou).toBe(true)
    expect(r.linhas).toHaveLength(TETO_LINHAS_TABELA)
    expect(r.linhas[0]).toEqual({ i: 0 })
    expect(r.linhas.at(-1)).toEqual({ i: TETO_LINHAS_TABELA - 1 })
  })

  it('mais que teto + 1 LANÇA: a janela da leitura falhou, e o corte não seria afirmável', () => {
    expect(() => decidirCorte(linhas(TETO_LINHAS_TABELA + 2), TETO_LINHAS_TABELA)).toThrow(/devia parar/)
  })

  it('vazio: sem corte', () => {
    expect(decidirCorte([], TETO_LINHAS_TABELA)).toEqual({ linhas: [], cortou: false })
  })

  it('não devolve o MESMO array recebido (quem chama pode mexer sem tocar na leitura)', () => {
    const lidas = linhas(3)
    expect(decidirCorte(lidas, TETO_LINHAS_TABELA).linhas).not.toBe(lidas)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('recusa o teto inválido %s', (teto) => {
    expect(() => decidirCorte(linhas(1), teto)).toThrow(/inválido/)
  })
})

describe('corteComTotal — o total do aviso vem da contagem, e só a que prova o corte', () => {
  it('teto + 1 (o menor total que um corte pode ter) é aceito', () => {
    expect(corteComTotal(TETO_LINHAS_TABELA, TETO_LINHAS_TABELA + 1)).toEqual({
      mostradas: TETO_LINHAS_TABELA,
      total: TETO_LINHAS_TABELA + 1,
    })
  })

  it('um total grande é aceito como veio — nunca arredondado nem trocado por "mais de"', () => {
    expect(corteComTotal(TETO_LINHAS_TABELA, 2_412)).toEqual({ mostradas: TETO_LINHAS_TABELA, total: 2_412 })
  })

  it('`null` (o PostgREST não contou) LANÇA', () => {
    expect(() => corteComTotal(TETO_LINHAS_TABELA, null)).toThrow(/desconhecido/)
  })

  it.each([TETO_LINHAS_TABELA, TETO_LINHAS_TABELA - 1, 0])(
    'total %s (≤ teto, depois de a leitura ter visto teto + 1) LANÇA — o acervo mudou entre as idas',
    (total) => {
      expect(() => corteComTotal(TETO_LINHAS_TABELA, total)).toThrow(/Recarregue/)
    },
  )
})

describe('janelaAteOLimite', () => {
  it('encurta o `to` para `limite − 1` e recusa o `from` que já chegou ao limite', () => {
    expect(janelaAteOLimite(0, 999, 2_001)).toEqual([0, 999])
    expect(janelaAteOLimite(1_000, 1_999, 2_001)).toEqual([1_000, 1_999])
    expect(janelaAteOLimite(2_000, 2_999, 2_001)).toEqual([2_000, 2_000])
    expect(janelaAteOLimite(2_001, 3_000, 2_001)).toBeNull()
    expect(janelaAteOLimite(5_000, 5_999, 2_001)).toBeNull()
  })
})

// A LEITURA DE VERDADE: `paginarTodos` (o laço de produção, com o teto de linhas OBSERVADO do
// PostgREST) + `paginaAteOLimite`, sobre uma fonte falsa que responde a (from, to) como o PostgREST
// — `maxRows` é o `max-rows` do projeto, que é configuração e não vale supor 1.000. É a mesma fonte
// de `queries/relatorios/comum.test.ts`.
function fonte(total: number, maxRows: number) {
  const chamadas: [number, number][] = []
  const fazPagina = (from: number, to: number) => {
    chamadas.push([from, to])
    const fim = Math.min(to + 1, from + maxRows, total)
    const data = []
    for (let i = from; i < fim; i++) data.push({ i })
    return Promise.resolve({ data, error: null })
  }
  return { chamadas, fazPagina }
}

const LIMITE = TETO_LINHAS_TABELA + 1

describe('a leitura das tabelas lê no máximo teto + 1 linhas, qualquer que seja o max-rows', () => {
  // 667 divide 2.001 EXATO (3 × 667): nenhuma página vem curta no limite, e é a janela vazia que
  // encerra — o caso que só `janelaAteOLimite` devolvendo `null` cobre.
  const MAX_ROWS = [1_000, 667, 500]
  const TOTAIS = [0, 7, TETO_LINHAS_TABELA - 1, TETO_LINHAS_TABELA, TETO_LINHAS_TABELA + 1, TETO_LINHAS_TABELA + 700, 5 * TETO_LINHAS_TABELA]

  for (const maxRows of MAX_ROWS) {
    it.each(TOTAIS)(`max-rows ${maxRows} · período com %s linhas`, async (total) => {
      const { chamadas, fazPagina } = fonte(total, maxRows)
      const lidas = await paginarTodos('rótulo', paginaAteOLimite(fazPagina, LIMITE), 100_000)
      const esperado = Math.min(total, LIMITE)
      expect(lidas).toHaveLength(esperado)
      // na ordem, sem repetir nem pular — as mais recentes são as primeiras da consulta
      expect(lidas.map((l) => l.i)).toEqual([...Array(esperado).keys()])
      // nenhuma ida ao banco pede linha além do limite — nem faixa invertida (`from > to`), que é o
      // que sairia se a janela esgotada não voltasse vazia SEM ir ao banco (com max-rows 667)
      expect(chamadas.every(([from, to]) => to <= LIMITE - 1 && from <= to)).toBe(true)
      // e a decisão sobre essa leitura é a esperada
      expect(decidirCorte(lidas, TETO_LINHAS_TABELA).cortou).toBe(total > TETO_LINHAS_TABELA)
    })
  }

  it('um período enorme custa as mesmas idas que um de teto + 1 (a leitura não cresce com o período)', async () => {
    const pequeno = fonte(LIMITE, 1_000)
    const enorme = fonte(50 * TETO_LINHAS_TABELA, 1_000)
    await paginarTodos('rótulo', paginaAteOLimite(pequeno.fazPagina, LIMITE), 100_000)
    await paginarTodos('rótulo', paginaAteOLimite(enorme.fazPagina, LIMITE), 100_000)
    expect(enorme.chamadas).toEqual(pequeno.chamadas)
    expect(enorme.chamadas).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_000],
    ])
  })
})

describe('montarTabelasTruncadas — a chave opcional do snapshot', () => {
  const corte = { mostradas: TETO_LINHAS_TABELA, total: 2_412 }

  it('sem corte nenhum → `undefined`, e o snapshot montado por espalhamento NÃO ganha a chave', () => {
    const tabelasTruncadas = montarTabelasTruncadas({})
    expect(tabelasTruncadas).toBeUndefined()
    const snapshot = { saidas: [], ...(tabelasTruncadas ? { tabelasTruncadas } : {}) }
    expect('tabelasTruncadas' in snapshot).toBe(false)
    expect(JSON.stringify(snapshot)).toBe('{"saidas":[]}')
  })

  it('`undefined` explícito nas três também não vira chave', () => {
    expect(
      montarTabelasTruncadas({ saidas: undefined, entradas: undefined, transferencias: undefined }),
    ).toBeUndefined()
  })

  it('só a tabela cortada entra', () => {
    const r = montarTabelasTruncadas({ entradas: corte })
    expect(r).toEqual({ entradas: corte })
    expect(Object.keys(r ?? {})).toEqual(['entradas'])
  })

  it('as três cortadas entram as três', () => {
    expect(montarTabelasTruncadas({ saidas: corte, entradas: corte, transferencias: corte })).toEqual({
      saidas: corte,
      entradas: corte,
      transferencias: corte,
    })
  })
})

describe('totalDaTabela — o número do título e do chip-âncora', () => {
  it('sem corte, o tamanho da lista (que aí é o total)', () => {
    expect(totalDaTabela(linhas(155), undefined)).toBe(155)
  })

  it('com corte, o total exato do período — nunca o tamanho da lista cortada', () => {
    expect(totalDaTabela(linhas(TETO_LINHAS_TABELA), { mostradas: TETO_LINHAS_TABELA, total: 2_412 })).toBe(2_412)
  })
})
