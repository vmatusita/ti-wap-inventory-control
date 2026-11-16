import { beforeEach, describe, expect, it, vi } from 'vitest'

// F67C (16/11/2026) — OS LEITORES DE CHAVE NATURAL RECORTAM PELA EMPRESA DE QUEM ESCREVE (PLAN-F67C §3, decisão 8).
//
// Desde a F65 a chave natural (slug da filial, nome_chave do colaborador, termos do vocabulário) é única POR EMPRESA.
// Com duas empresas, uma leitura por chave sozinha devolve duas linhas: `maybeSingle` lança, o último id ganha, o
// vocabulário duplica e `conferirVocabulario` recusa. Cada leitor passa a filtrar `.eq('empresa_id', <empresa>)`.
// Cliente falso com DUAS empresas e a MESMA chave; sem o filtro o teste cai (a sabotagem está em cada caso).
// Dados 100% fictícios.

vi.mock('server-only', () => ({}))
const registrarFalha = vi.hoisted(() => vi.fn())
vi.mock('@/lib/observabilidade', () => ({ registrarFalha }))

const h = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.cliente }))

const EMP_A = '00000000-0000-4000-a000-00000000000a'
const EMP_B = '00000000-0000-4000-a000-00000000000b'

type Linha = Record<string, unknown> & { __empresa: string }

/** Cliente falso: aplica `.eq`/`.in`/`.like` de verdade sobre linhas que carregam a empresa escondida. */
function clienteFalso(tabelas: Record<string, Linha[]>) {
  const chamadas: { tabela: string; filtros: [string, string, unknown][] }[] = []
  function from(tabela: string) {
    const filtros: [string, string, unknown][] = []
    chamadas.push({ tabela, filtros })
    let terminal: 'maybeSingle' | 'single' | null = null
    let teto = Infinity
    let colunas: string[] | null = null
    const valor = (l: Linha, c: string) => (c === 'empresa_id' ? l.__empresa : l[c])
    const builder: unknown = new Proxy(
      {},
      {
        get(_a, prop: string) {
          if (prop === 'then') {
            return (ok: (v: unknown) => unknown) => {
              let rows = (tabelas[tabela] ?? []).filter((l) =>
                filtros.every(([op, c, v]) => {
                  if (op === 'eq') return valor(l, c) === v
                  if (op === 'in') return (v as unknown[]).includes(valor(l, c))
                  if (op === 'like') return String(valor(l, c) ?? '').includes(String(v).replaceAll('%', ''))
                  return true
                }),
              )
              rows = rows.slice(0, teto)
              const limpas = rows.map(({ __empresa, ...resto }) => (void __empresa, Object.fromEntries(Object.entries(resto).filter(([k]) => !colunas || colunas.includes(k)))))
              if (terminal === 'maybeSingle') {
                if (limpas.length > 1) {
                  return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'mais de uma linha' } }).then(ok)
                }
                return Promise.resolve({ data: limpas[0] ?? null, error: null }).then(ok)
              }
              return Promise.resolve({ data: limpas, error: null }).then(ok)
            }
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            terminal = prop
            return () => builder
          }
          return (...args: unknown[]) => {
            if (prop === 'limit') teto = Number(args[0])
            if (prop === 'select' && typeof args[0] === 'string' && !args[0].includes('(')) {
              colunas = args[0].split(',').map((c) => c.trim())
            }
            if (prop === 'eq' || prop === 'in' || prop === 'like') filtros.push([prop, String(args[0]), args[1]])
            return builder
          }
        },
      },
    )
    return builder
  }
  return { client: { from } as never, chamadas }
}

beforeEach(() => registrarFalha.mockClear())

describe('resolverFilialPorSlug — o slug é único POR EMPRESA', () => {
  it('com o mesmo slug nas duas empresas, devolve a da empresa pedida (e não lança)', async () => {
    const { resolverFilialPorSlug } = await import('@/lib/queries/relatorios/comum')
    const { client } = clienteFalso({
      filiais: [
        { __empresa: EMP_A, id: 1, nome: 'Sede A', slug: 'sede' },
        { __empresa: EMP_B, id: 11, nome: 'Sede B', slug: 'sede' },
      ],
    })
    expect(await resolverFilialPorSlug(client, 'sede', EMP_B)).toEqual({ id: 11, nome: 'Sede B', slug: 'sede' })
    expect(await resolverFilialPorSlug(client, 'sede', EMP_A)).toEqual({ id: 1, nome: 'Sede A', slug: 'sede' })
  })
})

describe('colaboradores (queries) — a chave nome_chave é única POR EMPRESA', () => {
  const colaboradores: Linha[] = [
    { __empresa: EMP_A, id: 'a-maria', nome: 'Maria Silva', nome_chave: 'maria silva', ativo: true },
    { __empresa: EMP_B, id: 'b-maria', nome: 'Maria Silva', nome_chave: 'maria silva', ativo: true },
    { __empresa: EMP_B, id: 'b-mario', nome: 'Mario Souza', nome_chave: 'mario souza', ativo: true },
  ]

  it('resolverColaboradoresPorNome: o id é o da empresa pedida, nunca o "último que ganhou"', async () => {
    const { resolverColaboradoresPorNome } = await import('@/lib/queries/colaboradores')
    const { client } = clienteFalso({ colaboradores })
    const mapaB = await resolverColaboradoresPorNome(client, ['Maria Silva', 'Mario Souza'], EMP_B)
    expect(mapaB.get('maria silva')).toBe('b-maria')
    const mapaA = await resolverColaboradoresPorNome(client, ['Maria Silva', 'Mario Souza'], EMP_A)
    expect(mapaA.get('maria silva')).toBe('a-maria')
    expect(mapaA.has('mario souza')).toBe(false)
  })

  it('sugestoesDoCampoColaborador: lista e jaCadastrado só da empresa pedida', async () => {
    const { sugestoesDoCampoColaborador } = await import('@/lib/queries/colaboradores')
    const f = clienteFalso({ colaboradores, movimentacoes: [], lancamentos_item: [] })
    h.cliente = f.client
    const r = await sugestoesDoCampoColaborador('Mari', EMP_A)
    expect(r.cadastrados).toEqual(['Maria Silva'])
    const exatoA = await sugestoesDoCampoColaborador('Maria Silva', EMP_A)
    // sem o filtro o `maybeSingle` do "exato" vê duas linhas, erra, e jaCadastrado cai para false
    expect(exatoA.jaCadastrado).toBe(true)
    expect(registrarFalha).not.toHaveBeenCalled()
    const rB = await sugestoesDoCampoColaborador('Mari', EMP_B)
    expect(rB.cadastrados.sort()).toEqual(['Maria Silva', 'Mario Souza'])
  })
})

describe('lerVocabularioImport(client, empresa) — o vocabulário é o da empresa', () => {
  const categorias = (e: string): Linha[] =>
    [
      ['notebook', 'Notebook'],
      ['desktop', 'Desktop'],
      ['monitor', 'Monitor'],
      ['celular', 'Celular'],
      ['tablet', 'Tablet'],
    ].map(([termo, rotulo]) => ({ __empresa: e, termo, categoria: termo, rotulo }))
  const estados = (e: string): Linha[] =>
    [
      ['saida', 'em_uso', 'Saída'],
      ['estoque', 'em_estoque', 'Estoque'],
      ['reservado', 'reservado', 'Reservado'],
      ['emprestimo', 'emprestado', 'Empréstimo'],
      ['validar', 'em_triagem', 'Validar'],
      ['manutencao', 'em_manutencao', 'Manutenção'],
      ['defasado', 'defasado', 'Defasado'],
      ['descarte', 'descartado', null],
    ].map(([termo, estado, rotulo]) => ({ __empresa: e, termo, estado, rotulo }))

  function dados() {
    return {
      // os dois catálogos completos, com os MESMOS nomes de filial: sem o filtro, o termo aponta para duas filiais
      filiais: [
        { __empresa: EMP_A, id: 1, nome: 'Matriz', ativo: true },
        { __empresa: EMP_B, id: 11, nome: 'Matriz', ativo: true },
      ],
      unidades_apelidos: [
        { __empresa: EMP_A, filial_id: 1, apelido: 'Casa' },
        { __empresa: EMP_B, filial_id: 11, apelido: 'Casa' },
      ],
      import_termos_categoria: [...categorias(EMP_A), ...categorias(EMP_B)],
      import_termos_estado: [...estados(EMP_A), ...estados(EMP_B)],
      import_prefixos_patrimonio: [
        { __empresa: EMP_A, prefixo: 'WAP' },
        { __empresa: EMP_B, prefixo: 'XYZ' },
      ],
    }
  }

  it('lê só o catálogo da empresa pedida e NÃO lança com dois catálogos completos', async () => {
    const { lerVocabularioImport } = await import('@/lib/queries/vocabulario-import')
    const { client } = clienteFalso(dados())
    const vb = await lerVocabularioImport(client, EMP_B)
    expect(vb.filiais).toEqual([{ id: 11, nome: 'Matriz', ativa: true }])
    expect(vb.apelidos).toEqual([{ filialId: 11, apelido: 'Casa' }])
    expect(vb.prefixosPatrimonio).toEqual(['XYZ'])
    expect(vb.categorias).toHaveLength(5)
    const va = await lerVocabularioImport(client, EMP_A)
    expect(va.filiais).toEqual([{ id: 1, nome: 'Matriz', ativa: true }])
    expect(va.prefixosPatrimonio).toEqual(['WAP'])
  })

  it('as cinco leituras levam o filtro de empresa', async () => {
    const { lerVocabularioImport } = await import('@/lib/queries/vocabulario-import')
    const f = clienteFalso(dados())
    await lerVocabularioImport(f.client, EMP_B)
    expect(f.chamadas).toHaveLength(5)
    for (const c of f.chamadas) {
      expect(c.filtros, c.tabela).toContainEqual(['eq', 'empresa_id', EMP_B])
    }
  })
})
