import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A ENTRADA E A SAÍDA DA PORTA PÚBLICA (F68) — comportamento e fonte. Sucessor de `senhas-rate-limit.test.ts` (F64):
// a entrada saiu de `actions/senhas.ts` para `actions/porta.ts`, o contador mora DENTRO de `relatorio_publico_abrir`, e a
// propriedade que não pode afrouxar é a mesma — o erro do banco RECUSA antes de qualquer coisa (R-ACC-95), sem cookie e
// sem o formulário no log.
//
// O molde é o de `src/lib/auth/acesso-cargo.test.ts` (`vi.hoisted` + `vi.mock` + `await import`). Dados 100% fictícios;
// o IP é do bloco de documentação (RFC 5737).

const IP = '203.0.113.7'
const SENHA = 'senha-ficticia-f68'

const h = vi.hoisted(() => ({
  abrir: { tipo: 'recusada' } as { tipo: string; sessao?: string; erro?: unknown },
  cookies: [] as unknown[][],
  cookieLido: 'token-ficticio' as string | undefined,
  redirecionou: null as string | null,
}))
const abrirPorta = vi.hoisted(() => vi.fn(async () => h.abrir))
const pedirPorta = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
const registrarFalha = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': `${IP}, 10.0.0.1` }),
  cookies: async () => ({
    set: (...args: unknown[]) => h.cookies.push(args),
    get: () => (h.cookieLido ? { value: h.cookieLido } : undefined),
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    h.redirecionou = url
    throw new Error('NEXT_REDIRECT')
  },
}))
vi.mock('@/lib/supabase/publico', () => ({ abrirPorta, pedirPorta }))
vi.mock('@/lib/observabilidade', () => ({ registrarFalha }))

const { entrarNaPorta, sairDaPorta } = await import('@/lib/actions/porta')
const { MSG_FALHA_AO_CONFERIR_SENHA, MSG_MUITAS_TENTATIVAS, MSG_SENHA_INVALIDA, PORTA_COOKIE } = await import(
  '@/lib/auth/porta-rotas'
)

function formulario(empresa: string, next = '/r/wap/relatorios/gerados?filial=geral'): FormData {
  const f = new FormData()
  f.set('empresa', empresa)
  f.set('senha', SENHA)
  f.set('next', next)
  return f
}

async function entrar(empresa = 'wap', next?: string) {
  try {
    return await entrarNaPorta({}, formulario(empresa, next))
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') return 'redirecionou' as const
    throw e
  }
}

beforeEach(() => {
  h.abrir = { tipo: 'recusada' }
  h.cookies = []
  h.cookieLido = 'token-ficticio'
  h.redirecionou = null
  abrirPorta.mockClear()
  pedirPorta.mockClear()
  registrarFalha.mockClear()
})

describe('entrarNaPorta — a senha conferida pelo BANCO, e o erro dele recusa (R-ACC-95)', () => {
  it('chama a porta com o slug DA ROTA, a senha e a origem (o primeiro x-forwarded-for)', async () => {
    await entrar('wap')
    expect(abrirPorta).toHaveBeenCalledTimes(1)
    expect(abrirPorta).toHaveBeenCalledWith('wap', SENHA, IP)
  })

  it('erro do banco: RECUSA com a mensagem genérica, sem cookie, e registra a falha UMA vez — sem a senha', async () => {
    h.abrir = { tipo: 'falha', erro: new Error('conexão recusada') }
    expect(await entrar()).toEqual({ erro: MSG_FALHA_AO_CONFERIR_SENHA })
    expect(h.cookies).toEqual([])
    expect(registrarFalha).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(registrarFalha.mock.calls)).not.toContain(SENHA)
    expect(JSON.stringify(registrarFalha.mock.calls)).not.toContain(IP)
  })

  it('o contador estourado: "Muitas tentativas", sem cookie', async () => {
    h.abrir = { tipo: 'tentativas' }
    expect(await entrar()).toEqual({ erro: MSG_MUITAS_TENTATIVAS })
    expect(h.cookies).toEqual([])
  })

  it('as cinco recusas do banco viram UMA mensagem, sem cookie', async () => {
    h.abrir = { tipo: 'recusada' }
    expect(await entrar()).toEqual({ erro: MSG_SENHA_INVALIDA })
    expect(h.cookies).toEqual([])
  })

  it('slug fora do formato: a MESMA mensagem, e o banco nem é chamado', async () => {
    expect(await entrar('../admin')).toEqual({ erro: MSG_SENHA_INVALIDA })
    expect(abrirPorta).not.toHaveBeenCalled()
  })

  it('aberta: o cookie leva o TOKEN cru, com o path DA EMPRESA, httpOnly, 24 h; e o destino é da MESMA empresa', async () => {
    h.abrir = { tipo: 'aberta', sessao: 'a'.repeat(64) }
    expect(await entrar('wap')).toBe('redirecionou')
    expect(h.cookies).toHaveLength(1)
    const [nome, valor, opcoes] = h.cookies[0] as [string, string, Record<string, unknown>]
    expect(nome).toBe(PORTA_COOKIE)
    expect(valor).toBe('a'.repeat(64))
    expect(opcoes).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/r/wap', maxAge: 24 * 60 * 60 })
    expect(h.redirecionou).toBe('/r/wap/relatorios/gerados?filial=geral')
  })

  it('aberta com um next de OUTRA empresa: o destino cai nos gerados da empresa da rota', async () => {
    h.abrir = { tipo: 'aberta', sessao: 'b'.repeat(64) }
    await entrar('wap', '/r/outra/relatorios/gerados')
    expect(h.redirecionou).toBe('/r/wap/relatorios/gerados')
  })
})

describe('sairDaPorta — a sessão morre no BANCO e o cookie sai', () => {
  it('pede o encerrar com o token do cookie, apaga o cookie com o path da empresa e volta à entrada', async () => {
    const f = new FormData()
    f.set('empresa', 'wap')
    await expect(sairDaPorta(f)).rejects.toThrow('NEXT_REDIRECT')
    expect(pedirPorta).toHaveBeenCalledWith('encerrar', 'wap', 'token-ficticio')
    expect(h.cookies).toEqual([[PORTA_COOKIE, '', { path: '/r/wap', maxAge: 0 }]])
    expect(h.redirecionou).toBe('/r/wap/relatorios/acesso')
  })
})

describe('actions/porta.ts — a fonte', () => {
  const FONTE = readFileSync(fileURLToPath(new URL('./porta.ts', import.meta.url)), 'utf8')
  const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

  it('fala SÓ pela porta pública: nada de client administrativo, de sessão, nem de queries', () => {
    expect(CODIGO).toContain("from '@/lib/supabase/publico'")
    expect(CODIGO).not.toMatch(/@\/lib\/supabase\/(admin|server)|createAdminClient|@\/lib\/queries\//)
  })

  it('o ramo do erro do banco devolve ANTES de gravar cookie (o R-ACC-95 na fonte)', () => {
    const falha = CODIGO.indexOf("r.tipo === 'falha'")
    const cookie = CODIGO.indexOf('cookieStore.set(PORTA_COOKIE, r.sessao')
    expect(falha).toBeGreaterThan(-1)
    expect(cookie).toBeGreaterThan(falha)
  })
})
