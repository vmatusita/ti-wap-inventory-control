import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPRESA_LEGADA_ID } from '@/lib/auth/empresa-legada'

// F67C (16/11/2026) — OS LEITORES DAS ACTIONS RECORTAM PELA EMPRESA DE QUEM ESCREVE (PLAN-F67C §3, decisão 8).
//
// Cada action que acha o "homônimo" por chave natural (slug do tipo, nome_chave do item e do colaborador, código do
// motivo) ou que versiona por chave (relatório) filtra `.eq('empresa_id', <a empresa de quem escreve>)` e só toca a
// linha dela. Com DUAS empresas e a MESMA chave, sem o filtro: `maybeSingle` erra (duas linhas), o homônimo "existe"
// quando só existe na outra empresa, e o `update` alcança as duas. Cliente falso (molde de pertinencia.test.ts);
// actions com os mocks de sessão (molde de senhas-rate-limit.test.ts). Dados 100% fictícios.

const EMP_A = EMPRESA_LEGADA_ID // a empresa da operação (`empresaDaOperacao()`)
const EMP_B = '00000000-0000-4000-a000-00000000000b'

type Linha = Record<string, unknown> & { __empresa: string }
type Escrita = { tabela: string; op: string; payload: unknown; afetados: unknown[] }

const h = vi.hoisted(() => ({
  cliente: null as unknown,
  empresaDaFilial: new Map<number, string | null>(),
}))
const registrarFalha = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({}) }))
vi.mock('@/lib/observabilidade', () => ({ registrarFalha }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.cliente }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/auditoria-registro', () => ({ registrarEventoAdmin: vi.fn() }))
vi.mock('@/lib/auth/acesso', () => ({
  exigirAdmin: async () => ({ ok: true, uid: 'u-ficticio', papel: 'admin' }),
  exigirPapel: async () => ({ ok: true, uid: 'u-ficticio', papel: 'operador' }),
  exigirEscrita: async () => ({ ok: true, uid: 'u-ficticio', papel: 'operador' }),
  exigirEscritaEm: async () => ({ ok: true, uid: 'u-ficticio', papel: 'operador' }),
}))
vi.mock('@/lib/escopo/empresa-da-filial', () => ({
  empresaDaFilial: async (_c: unknown, filialId: number) => h.empresaDaFilial.get(filialId) ?? null,
  unidadesDaMesmaEmpresa: async () => [],
}))

function clienteFalso(tabelas: Record<string, Linha[]>) {
  const escritas: Escrita[] = []
  const consultas: { tabela: string; filtros: [string, string, unknown][] }[] = []
  function from(tabela: string) {
    const filtros: [string, string, unknown][] = []
    consultas.push({ tabela, filtros })
    let op = 'select'
    let payload: unknown = null
    let terminal: 'maybeSingle' | 'single' | null = null
    let teto = Infinity
    let colunas: string[] | null = null
    const valor = (l: Linha, c: string) => (c === 'empresa_id' ? l.__empresa : (l[c] ?? l['_f_' + c]))
    const builder: unknown = new Proxy(
      {},
      {
        get(_a, prop: string) {
          if (prop === 'then') {
            return (ok: (v: unknown) => unknown) => {
              let rows = (tabelas[tabela] ?? []).filter((l) =>
                filtros.every(([f, c, v]) => (f === 'eq' ? valor(l, c) === v : true)),
              )
              rows = rows.slice(0, teto)
              const limpas = rows.map(({ __empresa, ...resto }) => (void __empresa, Object.fromEntries(Object.entries(resto).filter(([k]) => !k.startsWith('_f_') && (!colunas || colunas.includes(k))))))
              if (op === 'insert' || op === 'upsert') {
                escritas.push({ tabela, op, payload, afetados: [] })
                const criado = { id: 99, nome: (payload as { nome?: string })?.nome ?? 'novo' }
                return Promise.resolve({ data: terminal ? criado : [criado], error: null }).then(ok)
              }
              if (op === 'update' || op === 'delete') {
                escritas.push({ tabela, op, payload, afetados: limpas.map((l) => l.id) })
                return Promise.resolve({ data: limpas.map((l) => ({ id: l.id })), error: null }).then(ok)
              }
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
            if (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') {
              op = prop
              payload = args[0]
            }
            if (prop === 'limit') teto = Number(args[0])
            if (prop === 'select' && typeof args[0] === 'string' && !args[0].includes('(')) {
              colunas = args[0].split(',').map((c) => c.trim())
            }
            if (prop === 'eq') filtros.push(['eq', String(args[0]), args[1]])
            return builder
          }
        },
      },
    )
    return builder
  }
  const client = { from }
  h.cliente = client
  return { escritas, consultas }
}

beforeEach(() => {
  registrarFalha.mockClear()
  h.empresaDaFilial = new Map()
})

describe('criarTipoItem — o slug é único POR EMPRESA', () => {
  it('slug que só existe na OUTRA empresa: cria na minha, com a minha empresa no INSERT', async () => {
    const { criarTipoItem } = await import('@/lib/actions/tipos-item')
    const f = clienteFalso({ tipos_item: [{ __empresa: EMP_B, id: 7, slug: 'cabo_rede', ativo: true }] })
    const r = await criarTipoItem({ slug: 'cabo_rede', rotulo: 'Cabo de rede', ordem: 10 })
    expect(r).toEqual({ ok: true, id: 99 })
    const ins = f.escritas.find((e) => e.tabela === 'tipos_item' && e.op === 'insert')
    expect(ins?.payload).toMatchObject({ empresa_id: EMP_A, slug: 'cabo_rede' })
  })

  it('slug repetido nas duas empresas: reativa SÓ o da minha (sem o filtro o maybeSingle erra)', async () => {
    const { criarTipoItem } = await import('@/lib/actions/tipos-item')
    const f = clienteFalso({
      tipos_item: [
        { __empresa: EMP_A, id: 1, slug: 'fone', ativo: false },
        { __empresa: EMP_B, id: 2, slug: 'fone', ativo: true },
      ],
    })
    const r = await criarTipoItem({ slug: 'fone', rotulo: 'Fone', ordem: 10 })
    expect(r).toMatchObject({ ok: true, id: 1, reativado: true })
    expect(f.consultas.find((c) => c.tabela === 'tipos_item')?.filtros).toContainEqual(['eq', 'empresa_id', EMP_A])
  })
})

describe('criarItemInline — o nome_chave é único POR EMPRESA', () => {
  it('homônimo só na OUTRA empresa: cria o item na minha, com a minha empresa', async () => {
    const { criarItemInline } = await import('@/lib/actions/itens')
    const f = clienteFalso({
      itens: [{ __empresa: EMP_B, id: 500, nome: 'Mochila', nome_chave: 'mochila', ativo: true, grupo: 'acessorio', ordem: 10 }],
    })
    const r = await criarItemInline({ nome: 'Mochila', grupo: 'acessorio' })
    expect(r).toMatchObject({ ok: true, id: 99 })
    const ins = f.escritas.find((e) => e.tabela === 'itens' && e.op === 'insert')
    expect(ins?.payload).toMatchObject({ empresa_id: EMP_A })
  })

  it('homônimo nas duas: devolve o da minha empresa, sem erro de "mais de uma linha"', async () => {
    const { criarItemInline } = await import('@/lib/actions/itens')
    clienteFalso({
      itens: [
        { __empresa: EMP_A, id: 5, nome: 'Mochila', nome_chave: 'mochila', ativo: true },
        { __empresa: EMP_B, id: 500, nome: 'Mochila', nome_chave: 'mochila', ativo: true },
      ],
    })
    expect(await criarItemInline({ nome: 'Mochila', grupo: 'acessorio' })).toEqual({ ok: true, id: 5 })
  })
})

describe('criarColaboradorInline — o nome_chave é único POR EMPRESA, e a empresa é a da FILIAL', () => {
  it('com filial da empresa B: o homônimo da A não vale, e a pessoa nasce na B', async () => {
    const { criarColaboradorInline } = await import('@/lib/actions/colaboradores')
    h.empresaDaFilial.set(11, EMP_B)
    const f = clienteFalso({
      colaboradores: [{ __empresa: EMP_A, id: 'a-maria', nome: 'Maria Silva', nome_chave: 'maria silva', ativo: true }],
    })
    const r = await criarColaboradorInline({ nome: 'Maria Silva', filial_id: 11 })
    expect(r).toMatchObject({ ok: true, id: 99 })
    const ins = f.escritas.find((e) => e.tabela === 'colaboradores' && e.op === 'insert')
    expect(ins?.payload).toMatchObject({ empresa_id: EMP_B })
  })

  it('sem filial: a empresa é a da operação e o homônimo dela é devolvido', async () => {
    const { criarColaboradorInline } = await import('@/lib/actions/colaboradores')
    clienteFalso({
      colaboradores: [
        { __empresa: EMP_A, id: 'a-maria', nome: 'Maria Silva', nome_chave: 'maria silva', ativo: true },
        { __empresa: EMP_B, id: 'b-maria', nome: 'Maria Silva', nome_chave: 'maria silva', ativo: true },
      ],
    })
    expect(await criarColaboradorInline({ nome: 'Maria Silva' })).toEqual({ ok: true, id: 'a-maria', nome: 'Maria Silva' })
  })

  it('filial que não resolve empresa: recusa com frase, nunca grava sem empresa', async () => {
    const { criarColaboradorInline } = await import('@/lib/actions/colaboradores')
    const f = clienteFalso({ colaboradores: [] })
    const r = await criarColaboradorInline({ nome: 'Ciclano Teste', filial_id: 404 })
    expect(r.ok).toBe(false)
    expect(f.escritas).toEqual([])
  })
})

describe('atualizarMotivo — o código é único POR EMPRESA; o update só alcança a minha', () => {
  const motivos: Linha[] = [
    { __empresa: EMP_A, id: 1, codigo: 'perda' },
    { __empresa: EMP_B, id: 2, codigo: 'perda' },
  ]
  it('grava SÓ na linha da empresa de quem escreve', async () => {
    const { atualizarMotivo } = await import('@/lib/actions/admin')
    const f = clienteFalso({ motivos })
    const r = await atualizarMotivo({ codigo: 'perda', rotulo: 'Perda', aplica_a: ['saida'], ativo: true })
    expect(r).toEqual({ ok: true })
    const up = f.escritas.find((e) => e.tabela === 'motivos' && e.op === 'update')
    expect(up?.afetados).toEqual([1])
  })
  it('0 linhas alcançadas: "Motivo não encontrado."', async () => {
    const { atualizarMotivo } = await import('@/lib/actions/admin')
    clienteFalso({ motivos: [{ __empresa: EMP_B, id: 2, codigo: 'perda' }] })
    const r = await atualizarMotivo({ codigo: 'perda', rotulo: 'Perda', aplica_a: ['saida'], ativo: true })
    expect(r).toEqual({ ok: false, erro: 'Motivo não encontrado.' })
  })
})

describe('consultarVersaoDoPeriodo / lerUltimaVersao — a versão é a da empresa do relatório', () => {
  it('o consolidado lê a versão só da empresa da operação (ramo filial null)', async () => {
    const { consultarVersaoDoPeriodo } = await import('@/lib/actions/relatorios')
    const f = clienteFalso({
      relatorios_gerados: [
        { __empresa: EMP_B, versao: 7, gerado_em: '2026-11-01T00:00:00Z', autor: { nome: 'B' }, _f_filial_id: null, _f_periodo_de: '2026-11-02', _f_periodo_ate: '2026-11-06' },
        { __empresa: EMP_A, versao: 2, gerado_em: '2026-11-01T00:00:00Z', autor: { nome: 'A' }, _f_filial_id: null, _f_periodo_de: '2026-11-02', _f_periodo_ate: '2026-11-06' },
      ],
    })
    const r = await consultarVersaoDoPeriodo({ filialSlug: 'geral', de: '2026-11-02', ate: '2026-11-06' })
    expect(r?.versao).toBe(2)
    const q = f.consultas.find((c) => c.tabela === 'relatorios_gerados')
    expect(q?.filtros).toContainEqual(['eq', 'empresa_id', EMP_A])
  })
})
