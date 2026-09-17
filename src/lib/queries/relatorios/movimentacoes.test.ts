import { describe, expect, it } from 'vitest'
import type { DbClient } from './comum'
import { buscarEstornosAteData } from './movimentacoes'
import { marcaEstorno } from '@/lib/relatorios/estorno'

// F60 · lote 2 (fato 20 · PLAN-F60 §6.7) — A MARCA "ESTORNADA" SOBREVIVE À MUDANÇA DE FORMA.
//
// `buscarEstornosAteData` deixou de ler TODO estorno até a data (no mesmo `Promise.all` das três
// tabelas) e passou a buscar só os estornos das movimentações que as tabelas JÁ leram, por
// `.in('estorno_de', lote)`, em lotes de 100 e keyset pelo `id`. O risco que esta suíte trava é o do
// "otimizar mais um pouco": o estorno grava a filial ATUAL do ativo (`aplicar_movimentacao`, 0122), e
// um ativo transferido depois da movimentação tem o estorno dela gravado na filial NOVA — um filtro
// de filial nesta leitura apagaria a marca no relatório da filial de origem, calado.
//
// O client é falso (o molde de `filtros/casos-limite.test.ts`): um Proxy que GRAVA a cadeia de
// chamadas e responde aplicando, sobre uma tabela em memória, os filtros que reconhece — `in`, `eq`,
// `lte`, `gt`, `order('id')` e `limit`. Filtro que ele não reconhece não é aplicado, mas fica gravado:
// a asserção "nenhum filtro toca filial" lê a cadeia, não o resultado. Tudo fictício: uuids
// sintéticos, datas de exemplo, filiais 1 e 2.

type Mov = { id: string; tipo: string; estorno_de: string | null; data: string; filial_id: number }
type Chamada = { metodo: string; args: unknown[] }

const uuid = (i: number) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`

function clienteFalso(tabela: readonly Mov[]): { client: DbClient; consultas: Chamada[][] } {
  const consultas: Chamada[][] = []

  function responder(chamadas: Chamada[]) {
    let linhas = [...tabela]
    let limite = Number.POSITIVE_INFINITY
    let colunas: string[] = []
    for (const { metodo, args } of chamadas) {
      const [coluna, valor] = args as [keyof Mov, unknown]
      if (metodo === 'select') colunas = String(args[0]).split(',').map((c) => c.trim())
      else if (metodo === 'in') linhas = linhas.filter((l) => (valor as unknown[]).includes(l[coluna]))
      else if (metodo === 'eq') linhas = linhas.filter((l) => l[coluna] === valor)
      else if (metodo === 'lte') linhas = linhas.filter((l) => String(l[coluna]) <= String(valor))
      else if (metodo === 'gt') linhas = linhas.filter((l) => String(l[coluna]) > String(valor))
      else if (metodo === 'order' && coluna === 'id') linhas.sort((a, b) => (a.id < b.id ? -1 : 1))
      else if (metodo === 'limit') limite = Number(args[0])
    }
    const data = linhas.slice(0, limite).map((l) => Object.fromEntries(colunas.map((c) => [c, l[c as keyof Mov]])))
    return { data, error: null }
  }

  function from(nome: string) {
    if (nome !== 'movimentacoes') throw new Error(`tabela inesperada: ${nome}`)
    const chamadas: Chamada[] = []
    consultas.push(chamadas)
    const builder: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === 'then') return (resolver: (v: unknown) => void) => resolver(responder(chamadas))
          return (...args: unknown[]) => {
            chamadas.push({ metodo: String(prop), args })
            return builder
          }
        },
      },
    )
    return builder
  }

  return { client: { from } as unknown as DbClient, consultas }
}

// A movimentação ORIGINAL: uma transferência gravada na filial 1 (a de origem) em 01/09. O ativo foi
// para a filial 2, e o estorno dela foi gravado lá — `filial_id` 2 — em 02/09.
const ORIGINAL = uuid(10)
const TABELA: Mov[] = [
  { id: ORIGINAL, tipo: 'transferencia', estorno_de: null, data: '2026-09-01', filial_id: 1 },
  { id: uuid(11), tipo: 'estorno', estorno_de: ORIGINAL, data: '2026-09-02', filial_id: 2 },
  // uma saída da filial 1 estornada DEPOIS do fim do período: não marca (o as-of do snapshot)
  { id: uuid(20), tipo: 'saida', estorno_de: null, data: '2026-09-01', filial_id: 1 },
  { id: uuid(21), tipo: 'estorno', estorno_de: uuid(20), data: '2026-09-30', filial_id: 1 },
  // o estorno de uma movimentação que NÃO está nas tabelas lidas: não é buscado
  { id: uuid(30), tipo: 'saida', estorno_de: null, data: '2026-09-01', filial_id: 2 },
  { id: uuid(31), tipo: 'estorno', estorno_de: uuid(30), data: '2026-09-03', filial_id: 2 },
]

describe('buscarEstornosAteData — a marca "estornada" com o estorno gravado noutra filial (F60)', () => {
  it('marca a movimentação da filial de origem cujo estorno foi gravado na filial de destino', async () => {
    const { client } = clienteFalso(TABELA)
    const mapa = await buscarEstornosAteData(client, [ORIGINAL, uuid(20)], '2026-09-15')
    expect(mapa.get(ORIGINAL)).toBe('2026-09-02')
    expect(marcaEstorno(mapa.get(ORIGINAL))).toEqual({ estornada: true, estornoData: '2026-09-02' })
    // o estorno depois do fim do período não marca; o de fora das tabelas nem é pedido
    expect(mapa.has(uuid(20))).toBe(false)
    expect(mapa.has(uuid(30))).toBe(false)
    expect([...mapa.keys()]).toEqual([ORIGINAL])
  })

  it('a leitura é por `.in(estorno_de)` + `tipo = estorno` + `data <= ate`, e NENHUM filtro toca filial', async () => {
    const { client, consultas } = clienteFalso(TABELA)
    await buscarEstornosAteData(client, [ORIGINAL], '2026-09-15')
    // Um lote só; o keyset pode pedir mais de uma página dele (a paginação só para na página vazia ou
    // mais curta que a primeira) — TODA página tem de carregar os mesmos filtros.
    expect(consultas.length).toBeGreaterThan(0)
    for (const cadeia of consultas) {
      expect(cadeia).toContainEqual({ metodo: 'in', args: ['estorno_de', [ORIGINAL]] })
      expect(cadeia).toContainEqual({ metodo: 'eq', args: ['tipo', 'estorno'] })
      expect(cadeia).toContainEqual({ metodo: 'lte', args: ['data', '2026-09-15'] })
      const tocaFilial = cadeia.filter((c) => JSON.stringify(c.args).includes('filial'))
      expect(tocaFilial, 'um filtro de filial apagaria a marca no relatório da filial de origem').toEqual([])
    }
  })

  it('sem ids, nenhuma ida ao banco (o período sem movimentação não paga leitura de estorno)', async () => {
    const { client, consultas } = clienteFalso(TABELA)
    expect((await buscarEstornosAteData(client, [], '2026-09-15')).size).toBe(0)
    expect(consultas).toHaveLength(0)
  })

  it('ids repetidos viram um só, e mais de 100 ids se dividem em lotes — sem perder o estorno do último lote', async () => {
    // 250 movimentações: a de índice 240 (no TERCEIRO lote) foi estornada noutra filial.
    const originais = Array.from({ length: 250 }, (_, i) => uuid(1000 + i))
    const tabela: Mov[] = [
      ...originais.map((id) => ({ id, tipo: 'saida', estorno_de: null, data: '2026-09-01', filial_id: 1 })),
      { id: uuid(5000), tipo: 'estorno', estorno_de: originais[240], data: '2026-09-05', filial_id: 2 },
    ]
    const { client, consultas } = clienteFalso(tabela)
    const mapa = await buscarEstornosAteData(client, [...originais, ...originais.slice(0, 50)], '2026-09-15')
    expect(mapa.get(originais[240])).toBe('2026-09-05')
    expect(mapa.size).toBe(1)
    // os lotes DISTINTOS pedidos (o keyset pode reler um lote por página): 100 + 100 + 50, sem repetir id
    const lotes = [...new Set(consultas.map((c) => JSON.stringify(c.find((x) => x.metodo === 'in')?.args[1])))].map(
      (l) => JSON.parse(l) as string[],
    )
    expect(lotes.map((l) => l.length)).toEqual([100, 100, 50])
    expect(new Set(lotes.flat()).size).toBe(250)
  })
})
