import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  ALCANCE_DA_RECUSA_MANUAL,
  cadastrosComMesmaIdentidade,
  recusasDeIdentidadeNoAcervo,
  recusasDeRepeticaoNoLote,
  type ItemComPatrimonio,
} from '@/lib/ativos/identidade'
import type { Database } from '@/lib/types/database'
import { limpar } from '@/lib/use-server-exports'

// F57 · Frente E — a identidade do ativo: o EFEITO da régua e a guarda de que ela mora num
// lugar só. Patrimônios, tags e filiais 100% fictícios.

// ---------------------------------------------------------------------------
// O acervo fictício e um client falso que aplica os filtros de verdade
// ---------------------------------------------------------------------------

type LinhaAtivo = {
  id: string
  patrimonio: string | null
  service_tag: string | null
  filial_id: number
  filiais: { nome: string }
}

const ACERVO: readonly LinhaAtivo[] = [
  // O par com tag, cadastrado na Bravo (filial 2).
  { id: 'a1', patrimonio: 'WAP0001234', service_tag: 'ST-01', filial_id: 2, filiais: { nome: 'Bravo' } },
  // O mesmo patrimônio SEM tag, na Charlie (filial 3) — outra identidade.
  { id: 'a2', patrimonio: 'WAP0001234', service_tag: null, filial_id: 3, filiais: { nome: 'Charlie' } },
  // Sem plaqueta: a tag sozinha identifica, na Delta (filial 4).
  { id: 'a3', patrimonio: null, service_tag: 'SEMPLACA-7', filial_id: 4, filiais: { nome: 'Delta' } },
]

type Filtro = { metodo: string; coluna: string; valor: unknown }

function clienteDoAcervo(): { client: SupabaseClient<Database>; consultas: Filtro[][] } {
  const consultas: Filtro[][] = []
  function from(tabela: string) {
    if (tabela !== 'ativos') throw new Error(`tabela inesperada: ${tabela}`)
    const filtros: Filtro[] = []
    consultas.push(filtros)
    const builder: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === 'then') {
            return (resolver: (v: unknown) => void) => {
              const data = ACERVO.filter((a) =>
                filtros.every(({ metodo, coluna, valor }) => {
                  const campo = a[coluna as keyof LinhaAtivo]
                  if (metodo === 'in') return (valor as unknown[]).includes(campo)
                  if (metodo === 'eq') return campo === valor
                  if (metodo === 'neq') return campo !== valor
                  if (metodo === 'is') return campo === valor
                  return true
                }),
              )
              resolver({ data, error: null })
            }
          }
          return (coluna: string, valor: unknown) => {
            if (prop !== 'select') filtros.push({ metodo: String(prop), coluna, valor })
            return builder
          }
        },
      },
    )
    return builder
  }
  return { client: { from } as unknown as SupabaseClient<Database>, consultas }
}

async function recusasDaCompra(itens: ItemComPatrimonio[]): Promise<string[]> {
  const { client } = clienteDoAcervo()
  const res = await cadastrosComMesmaIdentidade(
    client,
    itens.map((i) => ({ patrimonio: i.patrimonio, serviceTag: i.service_tag })),
    { alcance: ALCANCE_DA_RECUSA_MANUAL },
  )
  if (!res.ok) throw new Error(res.erro.message)
  return [...recusasDeRepeticaoNoLote(itens), ...recusasDeIdentidadeNoAcervo(itens, res.porChave)]
}

// ---------------------------------------------------------------------------
// O efeito — os dois lados
// ---------------------------------------------------------------------------

describe('a compra recusa a identidade que o acervo já tem — em QUALQUER filial (spec §10.2)', () => {
  it('par que já existe na MESMA filial: recusado, com a mensagem de sempre', async () => {
    expect(await recusasDaCompra([{ patrimonio: 'WAP0001234', service_tag: 'ST-01' }])).toEqual([
      'Já existe um ativo WAP0001234 com service tag ST-01 — use uma service tag distinta.',
    ])
  })

  it('par que já existe em OUTRA filial: TAMBÉM recusado — o conflito só nasce do import', async () => {
    // O acervo tem WAP0001234 sem tag na Charlie. Uma compra do mesmo par — em qualquer filial —
    // é recusada. É a regra da spec §10.2 que o índice por filial (0091) não segura sozinho.
    expect(await recusasDaCompra([{ patrimonio: 'WAP0001234', service_tag: null }])).toEqual([
      'Já existe um ativo WAP0001234 sem service tag — use uma service tag distinta.',
    ])
  })

  it('mesmo patrimônio com tag DIFERENTE é outra identidade: passa', async () => {
    expect(await recusasDaCompra([{ patrimonio: 'WAP0001234', service_tag: 'ST-99' }])).toEqual([])
  })

  it('repetição dentro do lote é recusada antes de olhar o acervo', async () => {
    expect(
      await recusasDaCompra([
        { patrimonio: 'WAP0009999', service_tag: 'ST-02' },
        { patrimonio: 'WAP0009999', service_tag: 'ST-02' },
      ]),
    ).toEqual(['Patrimônio repetido no lote: WAP0009999 (service tag ST-02).'])
  })
})

describe('cadastrosComMesmaIdentidade — a consulta única', () => {
  it('sem patrimônio, a tag sozinha identifica — e diz em qual filial está', async () => {
    const { client } = clienteDoAcervo()
    const res = await cadastrosComMesmaIdentidade(
      client,
      [{ patrimonio: null, serviceTag: 'SEMPLACA-7' }],
      { alcance: ALCANCE_DA_RECUSA_MANUAL },
    )
    expect(res.ok && [...res.porChave.values()].flat()).toEqual([
      { ativoId: 'a3', filialId: 4, filialNome: 'Delta' },
    ])
  })

  it('o próprio ativo não conta contra si (`excetoAtivoId`)', async () => {
    const { client } = clienteDoAcervo()
    const res = await cadastrosComMesmaIdentidade(
      client,
      [{ patrimonio: 'WAP0001234', serviceTag: 'ST-01' }],
      { alcance: ALCANCE_DA_RECUSA_MANUAL, excetoAtivoId: 'a1' },
    )
    expect(res.ok && res.porChave.size).toBe(0)
  })

  it('o alcance é REAL: recortado por unidade, a outra filial deixa de aparecer', async () => {
    // A mesma pergunta do caso "outra filial" acima, com o alcance trocado. Prova que o parâmetro
    // decide — e, portanto, que `ALCANCE_DA_RECUSA_MANUAL` é a escolha que mantém a recusa.
    const { client, consultas } = clienteDoAcervo()
    const par = [{ patrimonio: 'WAP0001234', serviceTag: null }]
    const recortado = await cadastrosComMesmaIdentidade(client, par, {
      alcance: { alcance: 'unidade', unidadeId: 2 },
    })
    expect(recortado.ok && recortado.porChave.size).toBe(0)
    expect(consultas.flat()).toContainEqual({ metodo: 'eq', coluna: 'filial_id', valor: 2 })
  })

  it('com o alcance da recusa manual, nenhuma cláusula de filial é aplicada', async () => {
    const { client, consultas } = clienteDoAcervo()
    await cadastrosComMesmaIdentidade(
      client,
      [
        { patrimonio: 'WAP0001234', serviceTag: null },
        { patrimonio: null, serviceTag: 'SEMPLACA-7' },
      ],
      { alcance: ALCANCE_DA_RECUSA_MANUAL },
    )
    expect(consultas).toHaveLength(2)
    expect(consultas.flat().filter((f) => f.coluna === 'filial_id')).toEqual([])
  })

  it('par sem identidade (sem patrimônio e sem tag) não consulta nada', async () => {
    const { client, consultas } = clienteDoAcervo()
    const res = await cadastrosComMesmaIdentidade(client, [{ patrimonio: null, serviceTag: '' }], {
      alcance: ALCANCE_DA_RECUSA_MANUAL,
    })
    expect(res.ok && res.porChave.size).toBe(0)
    expect(consultas).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// A guarda — a régua mora num lugar só
// ---------------------------------------------------------------------------
// Nasceu VERMELHA contra o código de 14/09/2026 (saída em
// `docs/f57-evidencias/sabotagem-D-identidade.txt`): `compras.ts`, `ativos.ts` e
// `devolucao-fornecedor.ts` consultavam a identidade cada um do seu jeito.

const RAIZ = process.cwd()
const posix = (p: string) => relative(RAIZ, p).split(sep).join('/')

function fontesSemTeste(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) fontesSemTeste(p, saida)
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) saida.push(p)
  }
  return saida
}

/**
 * O texto entre os parênteses de cada chamada de `nome(...)` — com os parênteses ANINHADOS
 * contados (`itens.map((i) => …)` dentro dos argumentos não pode encerrar a chamada). A fonte
 * chega já sem comentário e sem conteúdo de string (`limpar(…, true)`), então parêntese dentro de
 * texto não confunde a conta.
 */
function argumentosDasChamadas(fonte: string, nome: string): string[] {
  const saida: string[] = []
  for (const m of fonte.matchAll(new RegExp(String.raw`\b${nome}\s*\(`, 'g'))) {
    let profundidade = 1
    let i = (m.index ?? 0) + m[0].length
    const inicio = i
    while (i < fonte.length && profundidade > 0) {
      if (fonte[i] === '(') profundidade++
      else if (fonte[i] === ')') profundidade--
      i++
    }
    saida.push(fonte.slice(inicio, i - 1))
  }
  return saida
}

/** Consulta de `ativos` por patrimônio ou service tag — a forma de uma checagem de identidade. */
const CONSULTA_DE_IDENTIDADE = /\.(?:in|eq|is|neq)\(\s*['"](?:patrimonio|service_tag)['"]/g

function contagens(pasta: string): Record<string, number> {
  const saida: Record<string, number> = {}
  for (const p of fontesSemTeste(join(RAIZ, pasta))) {
    // Comentário não conta (`limpar`), string conta — o nome da coluna É uma string.
    const n = [...limpar(readFileSync(p, 'utf8'), false).matchAll(CONSULTA_DE_IDENTIDADE)].length
    if (n > 0) saida[posix(p)] = n
  }
  return saida
}

// Os usos LEGÍTIMOS fora do módulo, nominais e contados — nenhum é recusa de cadastro:
const PERMITIDOS_EM_QUERIES: Readonly<Record<string, { n: number; motivo: string }>> = {
  'src/lib/queries/ativos.ts': {
    n: 3,
    motivo:
      'filtro "sem patrimônio" da lista, o selo de patrimônio repetido da página e o "colar lista" da movimentação — leitura de TELA, nenhuma decide gravação',
  },
  'src/lib/queries/import-logs.ts': {
    n: 3,
    motivo:
      '`paresEmOutrasFiliais`: o IMPORT procura a identidade nas OUTRAS filiais de propósito (F24) — é a metade da regra em que o conflito PODE nascer',
  },
}

describe('a régua de identidade mora num lugar só (src/lib/ativos/identidade.ts)', () => {
  it('nenhuma Server Action consulta a identidade por conta própria', () => {
    expect(contagens('src/lib/actions')).toEqual({})
  })

  it('nenhuma Server Action monta a chave antiga (`chavePatrimonio`) para decidir duplicidade', () => {
    const culpados = fontesSemTeste(join(RAIZ, 'src', 'lib', 'actions'))
      .filter((p) => /\bchavePatrimonio\s*\(/.test(limpar(readFileSync(p, 'utf8'), true)))
      .map(posix)
    expect(culpados).toEqual([])
  })

  it('em queries, só os usos nominais de tela e de import', () => {
    const esperado = Object.fromEntries(
      Object.entries(PERMITIDOS_EM_QUERIES).map(([arquivo, { n }]) => [arquivo, n]),
    )
    expect(contagens('src/lib/queries')).toEqual(esperado)
  })

  it('as três recusas de cadastro chamam a consulta única, com o alcance de TODAS as unidades', () => {
    // A metade de PRESENÇA. Trocar o alcance numa action (recortar a compra por filial) derruba
    // este teste: é a mudança de regra da spec §10.2, e ela não pode entrar em silêncio.
    for (const arquivo of [
      'src/lib/actions/compras.ts',
      'src/lib/actions/ativos.ts',
      'src/lib/actions/devolucao-fornecedor.ts',
    ]) {
      const fonte = limpar(readFileSync(join(RAIZ, arquivo), 'utf8'), true)
      const chamadas = argumentosDasChamadas(fonte, 'cadastrosComMesmaIdentidade')
      expect(chamadas.length, `${arquivo}: chama a consulta única`).toBeGreaterThan(0)
      for (const args of chamadas) {
        expect(args, `${arquivo}: cadastrosComMesmaIdentidade(${args})`).toMatch(
          /alcance:\s*ALCANCE_DA_RECUSA_MANUAL\b/,
        )
      }
    }
  })
})
