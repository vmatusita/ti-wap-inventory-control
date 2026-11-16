import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// F67C (16/11/2026) — A TRILHA DIZ A EMPRESA (PLAN-F67C §2.3, decisão 20).
//
// `eventos_admin.empresa_id` perde o default na contração: o único escritor (`registrarEventoAdmin`, service role) manda
// a empresa ALVO, parâmetro obrigatório do evento — e as 15 chamadas em `src/lib/actions/**` a informam. O "não
// propaga" da F21 fica (a ação já aconteceu), mas o 23502 em `empresa_id` é NOMEADO no `registrarFalha`, sem o
// `details` do Postgres (que carrega os valores da linha).

vi.mock('server-only', () => ({}))
const h = vi.hoisted(() => ({ insert: vi.fn(), erro: null as unknown }))
const registrarFalha = vi.hoisted(() => vi.fn())
vi.mock('@/lib/observabilidade', () => ({ registrarFalha }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (linha: unknown) => {
        h.insert(linha)
        return Promise.resolve({ error: h.erro })
      },
    }),
  }),
}))

const EMPRESA = '00000000-0000-4000-a000-00000000000b'

beforeEach(() => {
  h.insert.mockClear()
  registrarFalha.mockClear()
  h.erro = null
})

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(join(dir, e.name)) : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

/** Cada chamada `registrarEventoAdmin({ … })` do texto: o objeto literal (chaves balanceadas). */
function chamadas(texto: string): string[] {
  const out: string[] = []
  for (const m of texto.matchAll(/(?<!import \{ )\bregistrarEventoAdmin\(\s*\{/g)) {
    let i = m.index! + m[0].length
    let prof = 1
    while (i < texto.length && prof > 0) {
      if (texto[i] === '{') prof++
      else if (texto[i] === '}') prof--
      i++
    }
    out.push(texto.slice(m.index! + m[0].length, i - 1))
  }
  return out
}

describe('as 15 chamadas de registrarEventoAdmin informam a empresa', () => {
  const todas = arquivos(join(process.cwd(), 'src', 'lib', 'actions')).flatMap((a) =>
    chamadas(readFileSync(a, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')).map((objeto) => ({ a, objeto })),
  )

  it('universo contado: 15 chamadas', () => {
    expect(todas).toHaveLength(15)
  })

  it.each(todas.map((c, i) => [i, c.a.replaceAll('\\', '/').split('src/')[1], c.objeto] as const))(
    'chamada %i (%s) traz a chave `empresa:`',
    (_i, _arq, objeto) => {
      expect(objeto).toMatch(/(^|[\s{,])empresa\s*[:,}]/)
    },
  )
})

describe('registrarEventoAdmin — o INSERT leva empresa_id', () => {
  it('manda a empresa do evento', async () => {
    const { registrarEventoAdmin } = await import('@/lib/auditoria-registro')
    await registrarEventoAdmin({ acao: 'convite_gerado', autor: 'u1', alvo: 'x@y', empresa: EMPRESA } as never)
    expect(h.insert).toHaveBeenCalledWith(expect.objectContaining({ empresa_id: EMPRESA }))
  })

  it('23502 em empresa_id: não propaga, nomeia a causa e NÃO leva o details ao log', async () => {
    const { registrarEventoAdmin } = await import('@/lib/auditoria-registro')
    h.erro = {
      code: '23502',
      message: 'null value in column "empresa_id" of relation "eventos_admin" violates not-null constraint',
      details: 'Failing row contains (valor-secreto-de-linha, outro-valor)',
    }
    await expect(
      registrarEventoAdmin({ acao: 'convite_gerado', autor: 'u1', alvo: 'x@y', empresa: EMPRESA } as never),
    ).resolves.toBeUndefined()
    expect(registrarFalha).toHaveBeenCalledTimes(1)
    const arg = registrarFalha.mock.calls[0][0] as { erro: unknown; ctx: Record<string, unknown> }
    expect(String(arg.ctx.causa)).toMatch(/empresa/i)
    expect(String(arg.ctx.causa)).toMatch(/23502/)
    expect(JSON.stringify(arg)).not.toContain('valor-secreto-de-linha')
    expect(JSON.stringify(arg)).not.toContain('Failing row')
  })

  it('outro erro (não 23502) segue o caminho de antes, sem causa nomeada', async () => {
    const { registrarEventoAdmin } = await import('@/lib/auditoria-registro')
    h.erro = { code: '42501', message: 'permission denied' }
    await registrarEventoAdmin({ acao: 'convite_gerado', autor: 'u1', alvo: 'x@y', empresa: EMPRESA } as never)
    const arg = registrarFalha.mock.calls[0][0] as { ctx: Record<string, unknown> }
    expect(arg.ctx.causa).toBeUndefined()
  })
})
