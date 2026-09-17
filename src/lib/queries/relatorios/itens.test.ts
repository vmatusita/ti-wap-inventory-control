import { describe, it, expect , vi } from 'vitest'

// F49 — um módulo de `@/lib/queries/**` (ou algo que ele alcança) passou a declarar
// `import 'server-only'`, que é a fronteira RSC: ele existe para QUEBRAR o build se um
// Client Component importar a query. No ambiente `node` do Vitest esse import lança
// sempre, então o stub vazio. Não afrouxa nada — quem prova a fronteira é o
// `npm run build` (ver `src/lib/queries/servidor-apenas.test.ts`).
vi.mock('server-only', () => ({}))
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { OBS_SALDO_INICIAL } from '@/lib/dominio'
import { Constants } from '@/lib/types/database'
import { chamarRpc } from '@/lib/supabase/rpc'
import type { Filial } from '@/lib/queries/filiais'
import {
  estoqueForaDasColunas,
  montarSaldosPorFilial,
  somarSaldosDaSelecao,
  type SaldoItemNivel,
} from '@/lib/queries/itens'
import type { DbClient } from './comum'
import { ehSaldoInicialGoLive, lerSaldoItensEmNiveis, mapLancamentoItemRow } from './itens'

// B5 (F6B) — funções puras da tabela de movimentações de itens do relatório.
// O filtro efetivo no banco é o `.or('observacao.is.null,observacao.neq."…"')`
// (null-safe, testado por integração no A1); aqui garantimos o backstop em JS e o
// mapeamento, com LINHAS SINTÉTICAS (nenhum dado real — CLAUDE.md).

// Linha crua mínima (embeds do PostgREST) para o mapeamento.
function raw(over: Partial<Parameters<typeof mapLancamentoItemRow>[0]> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    data: '2026-07-13',
    tipo: 'entrada' as const,
    quantidade: 3,
    chamado: null,
    colaborador: null,
    observacao: null,
    estorna_id: null,
    item: { nome: 'Mouse sem fio', grupo: 'acessorio' as const },
    filial: { nome: 'Matriz' },
    ...over,
  }
}

describe('ehSaldoInicialGoLive (marcador da carga de saldos — F6C)', () => {
  it('reconhece a observação EXATA da carga', () => {
    expect(ehSaldoInicialGoLive(OBS_SALDO_INICIAL)).toBe(true)
    expect(ehSaldoInicialGoLive('saldo inicial (go-live)')).toBe(true)
  })

  it('observacao NULL NÃO é marcador (aparece na tabela — gotcha .neq + NULL)', () => {
    expect(ehSaldoInicialGoLive(null)).toBe(false)
  })

  it('observação comum NÃO é marcador', () => {
    expect(ehSaldoInicialGoLive('reposição de estoque')).toBe(false)
    expect(ehSaldoInicialGoLive('saldo inicial')).toBe(false) // sem o sufixo exato
  })
})

describe('filtro da carga sobre linhas sintéticas', () => {
  const rows = [
    raw({ id: 'a', observacao: null }), // sem observação → aparece
    raw({ id: 'b', observacao: 'troca de teclado' }), // comum → aparece
    raw({ id: 'c', observacao: OBS_SALDO_INICIAL }), // marcador → sai
  ]

  it('mantém NULL e comum, remove o marcador da carga', () => {
    const visiveis = rows.filter((r) => !ehSaldoInicialGoLive(r.observacao)).map((r) => r.id)
    expect(visiveis).toEqual(['a', 'b'])
  })
})

describe('mapLancamentoItemRow', () => {
  it('mapeia embeds e sinaliza estorno por estorna_id', () => {
    const linha = mapLancamentoItemRow(
      raw({
        id: 'x',
        tipo: 'ajuste',
        quantidade: -2,
        chamado: '123',
        colaborador: 'Fulano de Tal',
        observacao: 'correção de inventário',
        estorna_id: 'y',
      }),
    )
    expect(linha).toEqual({
      id: 'x',
      data: '2026-07-13',
      filial: 'Matriz',
      item: 'Mouse sem fio',
      grupo: 'acessorio',
      tipo: 'ajuste',
      quantidade: -2,
      chamado: '123',
      colaborador: 'Fulano de Tal',
      obs: 'correção de inventário',
      ehEstorno: true,
    })
  })

  it('tolera embeds ausentes (item/filial nulos) e não estorno', () => {
    const linha = mapLancamentoItemRow(raw({ item: null, filial: null }))
    expect(linha.item).toBe('—')
    expect(linha.filial).toBe('—')
    expect(linha.grupo).toBe('acessorio')
    expect(linha.ehEstorno).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// F60 · revisão do lote 2 — O SALDO EM DOIS NÍVEIS NÃO PERDE LINHA NO `max-rows` DO PostgREST
// ---------------------------------------------------------------------------
// `rel_saldo_itens_filiais` devolve (filiais do recorte + 1) × itens linhas numa resposta, ordenada
// `filial_id nulls first`. Lida numa ida só, o `max-rows` (1.000 por padrão) cortava em silêncio as
// linhas das filiais de id MAIS ALTO: com seis filiais, a partir de 143 itens. `lerSaldoItensEmNiveis`
// passou a paginar; esta suíte prova o conserto contra um PostgREST de mentira que aplica o corte, e
// prova que o MESMO cenário, lido do jeito de antes, perde a coluna (a guarda do próprio teste).
//
// O client é falso, no molde de `movimentacoes.test.ts`: um Proxy que GRAVA a cadeia e responde como o
// PostgREST responderia a uma RPC — aplica os `.order()` (com `nullsFirst`, e o enum `grupo_item` na
// ordem DECLARADA do tipo, lida de `Constants`), o `.range()` e, por cima, o `max-rows`. Sem `.order()`,
// devolve na ordem do corpo da função. Com `.order()`, EMBARALHA antes de ordenar a cada pedido (o plano
// que muda entre duas páginas): ordem que não fosse total repetiria ou perderia linha.
// Tudo fictício: filiais 1–6, itens "Item 0001"…, números sintéticos.

const MAX_ROWS = 1000
const ORDEM_DO_GRUPO: readonly string[] = Constants.public.Enums.grupo_item
const SEIS_FILIAIS: Filial[] = [1, 2, 3, 4, 5, 6].map((id) => ({
  id,
  slug: `filial-${id}`,
  nome: `Filial ${id}`,
  cidade: `Cidade ${id}`,
}))
const IDS_SEIS = SEIS_FILIAIS.map((f) => f.id)

type Pedido = { nome: string; args: unknown; cadeia: { metodo: string; args: unknown[] }[] }

/**
 * O resultado da função, NA ORDEM DO CORPO (`filial_id nulls first, grupo, ordem, nome`): cada item com
 * estoque 1 em cada filial e o total igual ao número de filiais. Os ids NÃO seguem essa ordem de
 * propósito (grupo e `ordem` invertidos em relação ao id) — ordenar por `item_id` daria outra sequência.
 */
function resultadoDaFuncao(filiais: readonly number[], itens: number): SaldoItemNivel[] {
  const catalogo = Array.from({ length: itens }, (_, i) => {
    const id = i + 1
    return {
      item_id: id,
      item: `Item ${String(id).padStart(4, '0')}`,
      grupo: (id % 2 === 0 ? 'acessorio' : 'componente') as SaldoItemNivel['grupo'],
      ordem: itens - id,
    }
  }).sort(
    (a, b) =>
      ORDEM_DO_GRUPO.indexOf(a.grupo) - ORDEM_DO_GRUPO.indexOf(b.grupo) || a.ordem - b.ordem || (a.item < b.item ? -1 : 1),
  )
  return [null, ...[...filiais].sort((a, b) => a - b)].flatMap((filial_id) =>
    catalogo.map((c) => {
      const n = filial_id === null ? filiais.length : 1
      return { filial_id, ...c, total: n, estoque: n, atrelados: 0, falta: 0 }
    }),
  )
}

/** Um gerador congruencial com semente: o embaralhamento muda a cada pedido, e a suíte é reprodutível. */
function embaralhador(semente: number) {
  let x = semente
  return <T>(lista: readonly T[]): T[] => {
    const out = [...lista]
    for (let i = out.length - 1; i > 0; i--) {
      x = (x * 1103515245 + 12345) % 2147483648
      const j = x % (i + 1)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
}

type OpcoesDeOrdem = { ascending?: boolean; nullsFirst?: boolean } | undefined

function comparar(coluna: string, opcoes: OpcoesDeOrdem) {
  const asc = opcoes?.ascending !== false
  const nullsFirst = opcoes?.nullsFirst ?? !asc // o padrão do Postgres: NULLS LAST em ASC
  return (a: Record<string, unknown>, b: Record<string, unknown>): number => {
    const va = a[coluna]
    const vb = b[coluna]
    if (va === vb) return 0
    if (va === null) return nullsFirst ? -1 : 1
    if (vb === null) return nullsFirst ? 1 : -1
    const base =
      coluna === 'grupo'
        ? ORDEM_DO_GRUPO.indexOf(String(va)) - ORDEM_DO_GRUPO.indexOf(String(vb))
        : (va as number | string) < (vb as number | string)
          ? -1
          : 1
    return asc ? base : -base
  }
}

function postgrestFalso(resultado: readonly SaldoItemNivel[], maxRows = MAX_ROWS) {
  const pedidos: Pedido[] = []
  const embaralhar = embaralhador(7)

  function responder(cadeia: Pedido['cadeia']) {
    const ordens = cadeia.filter((c) => c.metodo === 'order')
    let linhas: Record<string, unknown>[] = ordens.length === 0 ? [...resultado] : embaralhar(resultado)
    // da última chave para a primeira, com `sort` estável: a chave anterior desempata a seguinte
    for (const { args } of [...ordens].reverse()) {
      const [coluna, opcoes] = args as [string, OpcoesDeOrdem]
      linhas = [...linhas].sort(comparar(coluna, opcoes))
    }
    const faixa = cadeia.find((c) => c.metodo === 'range')?.args as [number, number] | undefined
    const de = faixa ? faixa[0] : 0
    const quantas = Math.min(faixa ? faixa[1] - faixa[0] + 1 : Number.POSITIVE_INFINITY, maxRows)
    return { data: linhas.slice(de, de + quantas), error: null }
  }

  function rpc(nome: string, args: unknown) {
    const pedido: Pedido = { nome, args, cadeia: [] }
    pedidos.push(pedido)
    const builder: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === 'then') return (resolver: (v: unknown) => void) => resolver(responder(pedido.cadeia))
          return (...a: unknown[]) => {
            pedido.cadeia.push({ metodo: String(prop), args: a })
            return builder
          }
        },
      },
    )
    return builder
  }

  return { client: { rpc } as unknown as DbClient, pedidos }
}

describe('lerSaldoItensEmNiveis — a leitura inteira, com o `max-rows` cortando (F60 · revisão do lote 2)', () => {
  // 6 filiais × 143 itens + o nível do total = 1.001 linhas: a primeira que passa do `max-rows`.
  const CHEIO = resultadoDaFuncao(IDS_SEIS, 143)

  it('a fixture passa do `max-rows` por UMA linha (guarda do próprio teste)', () => {
    expect(CHEIO).toHaveLength(MAX_ROWS + 1)
  })

  it('a guarda do cenário: a ida ÚNICA de antes, sob o mesmo corte, perde a coluna da última filial', async () => {
    // O que `lerSaldosEmNiveis` fazia até a revisão: um `await` na RPC, sem página. Se este caso ficasse
    // verde com a leitura de antes, o cenário não enxergaria o defeito e a prova abaixo seria vácuo.
    const { client } = postgrestFalso(CHEIO)
    const { data } = await chamarRpc(client, 'rel_saldo_itens_filiais', { p_filiais: IDS_SEIS, p_ate: '2026-09-16' })
    const linhas: SaldoItemNivel[] = data ?? []
    expect(linhas).toHaveLength(MAX_ROWS)
    const cortado = montarSaldosPorFilial(SEIS_FILIAIS, linhas).find((l) => l.porFilial[6] === undefined)
    expect(cortado, 'a coluna da filial 6 de algum item sumiu').toBeDefined()
    expect(estoqueForaDasColunas(cortado!, SEIS_FILIAIS), '"fora das colunas" aceso sem filial desativada').toBe(1)
    const soma = somarSaldosDaSelecao(IDS_SEIS, linhas).find((s) => s.item_id === cortado!.item_id)
    expect(soma?.estoque, 'a soma da multi-seleção sai menor').toBe(5)
  })

  it('lê as 1.001 linhas em páginas: nenhuma coluna some, o "fora das colunas" fica 0 e a soma é a inteira', async () => {
    const { client, pedidos } = postgrestFalso(CHEIO)
    const linhas = await lerSaldoItensEmNiveis(client, IDS_SEIS, '2026-09-16')
    expect(linhas).toHaveLength(MAX_ROWS + 1)
    for (const l of montarSaldosPorFilial(SEIS_FILIAIS, linhas)) {
      for (const f of SEIS_FILIAIS) expect(l.porFilial[f.id]?.estoque, `${l.item} na filial ${f.id}`).toBe(1)
      expect(estoqueForaDasColunas(l, SEIS_FILIAIS), l.item).toBe(0)
      expect(l.consolidado.estoque).toBe(6)
    }
    for (const s of somarSaldosDaSelecao(IDS_SEIS, linhas)) expect(s.estoque, s.item).toBe(6)
    // duas idas: a página cheia (1.000, que fixa o teto observado) e a curta (1), que prova o fim
    expect(pedidos.map((p) => p.cadeia.find((c) => c.metodo === 'range')?.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    // e TODA página chama a MESMA função com os MESMOS argumentos — o recorte não muda entre elas
    for (const p of pedidos) {
      expect(p.nome).toBe('rel_saldo_itens_filiais')
      expect(p.args).toEqual({ p_filiais: IDS_SEIS, p_ate: '2026-09-16' })
    }
  })

  it('a ordem é a do CORPO da função, imposta na chamada e total — o plano embaralhado entre as páginas não repete nem perde linha', async () => {
    const { client, pedidos } = postgrestFalso(CHEIO)
    expect(await lerSaldoItensEmNiveis(client, IDS_SEIS, '2026-09-16')).toEqual(CHEIO)
    for (const p of pedidos) {
      expect(p.cadeia.filter((c) => c.metodo === 'order').map((c) => c.args)).toEqual([
        ['filial_id', { ascending: true, nullsFirst: true }],
        ['grupo', { ascending: true }],
        ['ordem', { ascending: true }],
        ['item', { ascending: true }],
        ['item_id', { ascending: true }],
      ])
    }
  })

  it('com um `max-rows` menor que a página pedida (500), o fim continua sendo o do teto OBSERVADO', async () => {
    const { client, pedidos } = postgrestFalso(CHEIO, 500)
    expect(await lerSaldoItensEmNiveis(client, IDS_SEIS, '2026-09-16')).toEqual(CHEIO)
    expect(pedidos).toHaveLength(3) // 500 + 500 + 1
  })

  it('uma filial só: as duas metades (o nível do total e a linha dela, que vem DEPOIS e era a que sumia) voltam inteiras', async () => {
    const uma = resultadoDaFuncao([4], 600) // 1.200 linhas
    const { client } = postgrestFalso(uma)
    const linhas = await lerSaldoItensEmNiveis(client, [4], '2026-09-16')
    expect(linhas.filter((l) => l.filial_id === 4)).toHaveLength(600)
    expect(linhas.filter((l) => l.filial_id === null)).toHaveLength(600)
  })

  it('lista vazia não vai ao banco', async () => {
    const { client, pedidos } = postgrestFalso(CHEIO)
    expect(await lerSaldoItensEmNiveis(client, [], '2026-09-16')).toEqual([])
    expect(pedidos).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// A PORTA ÚNICA da leitura de dois níveis — a ida sem página não volta por outro arquivo
// ---------------------------------------------------------------------------
// O conserto acima vale enquanto TODA leitura de `rel_saldo_itens_filiais` do app passar por
// `lerSaldoItensEmNiveis`. Uma chamada nova da RPC num `await` solto reabriria o corte calado com esta
// suíte verde. A varredura é pela AST de `src/**` (sem testes), nunca por texto: comentário que cita a
// RPC não é chamada. Lê o disco na COLETA.
const RPC_EM_NIVEIS = 'rel_saldo_itens_filiais'
const RAIZ = process.cwd()

type ChamadaDaRpc = { onde: string; funcao: string | null; paginada: boolean }

function chamadasDaRpcEmNiveis(sf: ts.SourceFile, onde: string): ChamadaDaRpc[] {
  const achadas: ChamadaDaRpc[] = []
  const visitar = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'chamarRpc') {
      const nome = n.arguments[1]
      if (nome && ts.isStringLiteralLike(nome) && nome.text === RPC_EM_NIVEIS) {
        let funcao: string | null = null
        let paginada = false
        for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
          if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'paginarTodos') paginada = true
          if (funcao === null && ts.isFunctionDeclaration(p) && p.name) funcao = p.name.text
        }
        achadas.push({ onde: `${onde}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`, funcao, paginada })
      }
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return achadas
}

function fontesDe(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) fontesDe(p, acc)
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') && !/\.test\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}

const CHAMADAS_DA_RPC_EM_NIVEIS = fontesDe(join(RAIZ, 'src')).flatMap((p) => {
  const fonte = readFileSync(p, 'utf8')
  if (!fonte.includes(RPC_EM_NIVEIS)) return []
  const tipo = p.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return chamadasDaRpcEmNiveis(ts.createSourceFile(p, fonte, ts.ScriptTarget.Latest, true, tipo), relative(RAIZ, p).split(sep).join('/'))
})

const doTrecho = (fonte: string) =>
  chamadasDaRpcEmNiveis(ts.createSourceFile('trecho.ts', fonte, ts.ScriptTarget.Latest, true), 'trecho.ts').map(
    ({ funcao, paginada }) => ({ funcao, paginada }),
  )

describe('a leitura de dois níveis tem UMA porta, paginada (F60 · revisão do lote 2)', () => {
  it('a varredura reconhece a chamada paginada e a solta (guarda do próprio teste)', () => {
    expect(
      doTrecho(`async function lerSaldoItensEmNiveis(c) { return paginarTodos("x", (a, b) => chamarRpc(c, '${RPC_EM_NIVEIS}', {}).range(a, b), CAP_X) }`),
    ).toEqual([{ funcao: 'lerSaldoItensEmNiveis', paginada: true }])
    expect(doTrecho(`async function outra(c) { const { data } = await chamarRpc(c, '${RPC_EM_NIVEIS}', {}); return data }`)).toEqual([
      { funcao: 'outra', paginada: false },
    ])
    // comentário e texto que citam a RPC não são chamada
    expect(doTrecho(`// chamarRpc(c, '${RPC_EM_NIVEIS}', {})\nconst t = "chamarRpc(c, '${RPC_EM_NIVEIS}')"`)).toEqual([])
  })

  it('a ÚNICA chamada de `rel_saldo_itens_filiais` em `src/**` é a de `lerSaldoItensEmNiveis`, dentro de `paginarTodos`', () => {
    expect(CHAMADAS_DA_RPC_EM_NIVEIS.map(({ onde, funcao, paginada }) => ({ arquivo: onde.split(':')[0], funcao, paginada }))).toEqual([
      { arquivo: 'src/lib/queries/relatorios/itens.ts', funcao: 'lerSaldoItensEmNiveis', paginada: true },
    ])
  })
})
