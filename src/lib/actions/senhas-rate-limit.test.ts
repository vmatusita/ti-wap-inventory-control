import { beforeEach, describe, expect, it, vi } from 'vitest'

// F64 (23/09/2026) — O RATE-LIMIT DA SENHA DE VISUALIZAÇÃO FALHA FECHADO (decisão 3 do Johnny, que
// reverte a X4 de DECISOES.md). Até a F63, `entrarComSenha` fazia
// `const { data: excedeu } = await chamarRpc(admin, 'registrar_tentativa_senha', …)`: o `error` era
// descartado, `null` é falsy, e uma falha do contador liberava a varredura de senha — o rate-limit
// caía exatamente quando o banco estava sob pressão. Agora o `error` RECUSA: nenhuma senha é lida
// nem conferida, nenhum cookie nasce, a falha vai para `registrarFalha` (sem o IP — dado pessoal que
// o funil não redige por valor) e a resposta é genérica.
//
// Este é o teste de COMPORTAMENTO (a sabotagem D da ordem): a action roda de verdade, com o client
// de service role, a RPC, os headers, os cookies e a conferência de senha SIMULADOS — o molde de
// `src/lib/auth/acesso-cargo.test.ts` (`vi.hoisted` + `vi.mock` + `await import`). A trava de FONTE
// irmã, que reprova a volta ao `const { data: excedeu }`, mora em `senhas.test.ts`. Dados 100%
// fictícios; o IP é do bloco de documentação (RFC 5737).

const IP = '203.0.113.7'

const h = vi.hoisted(() => ({
  rpc: { data: false as unknown, error: null as unknown },
  leuSenhas: 0,
  cookies: [] as unknown[],
  redirecionou: null as string | null,
}))

const verificarSenha = vi.hoisted(() => vi.fn(async () => true))
const registrarFalha = vi.hoisted(() => vi.fn())
const chamarRpc = vi.hoisted(() => vi.fn(async () => ({ data: h.rpc.data, error: h.rpc.error })))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': `${IP}, 10.0.0.1` }),
  cookies: async () => ({ set: (...args: unknown[]) => h.cookies.push(args) }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    h.redirecionou = url
    throw new Error('NEXT_REDIRECT')
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === 'senhas_acesso') h.leuSenhas++
      const q = {
        select: () => q,
        update: () => q,
        eq: () => q,
        then: (ok: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: [{ id: 'f64-senha-ficticia', hash: 'scrypt$ficticio' }], error: null }).then(ok),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/supabase/rpc', () => ({ chamarRpc }))
vi.mock('@/lib/auth/senha-sessao', () => ({
  assinarSessaoView: () => ({ value: 'sessao-ficticia' }),
  hashSenha: vi.fn(),
  verificarSenha,
  VIEW_COOKIE_NAME: 'estoque_view',
  VIEW_MAX_AGE_SEG: 60,
}))
vi.mock('@/lib/auth/acesso', () => ({ exigirAdmin: vi.fn() }))
vi.mock('@/lib/auditoria-registro', () => ({ registrarEventoAdmin: vi.fn() }))
vi.mock('@/lib/observabilidade', () => ({ registrarFalha }))

const { entrarComSenha } = await import('@/lib/actions/senhas')

function formulario(senha: string): FormData {
  const f = new FormData()
  f.set('senha', senha)
  f.set('next', '/relatorios/geral')
  return f
}

async function entrar(senha = 'senha-ficticia-f64') {
  try {
    return await entrarComSenha({}, formulario(senha))
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') return 'redirecionou' as const
    throw e
  }
}

beforeEach(() => {
  h.rpc = { data: false, error: null }
  h.leuSenhas = 0
  h.cookies = []
  h.redirecionou = null
  verificarSenha.mockClear()
  registrarFalha.mockClear()
  chamarRpc.mockClear()
})

describe('entrarComSenha — o contador de tentativas falha FECHADO (F64, sabotagem D)', () => {
  it('a RPC do contador é chamada com o IP do cliente (o primeiro do x-forwarded-for)', async () => {
    await entrar()
    expect(chamarRpc).toHaveBeenCalledTimes(1)
    expect(chamarRpc.mock.calls[0]).toEqual([expect.anything(), 'registrar_tentativa_senha', { p_ip: IP }])
  })

  it('com `error` na RPC: RECUSA — nenhuma senha lida nem conferida, nenhum cookie, nenhum redirect', async () => {
    h.rpc = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout', details: `ip ${IP}` } }
    const r = await entrar()
    expect(r).toEqual({ erro: expect.any(String) })
    expect(h.leuSenhas, 'leu senhas_acesso com o contador fora').toBe(0)
    expect(verificarSenha, 'conferiu senha com o contador fora').not.toHaveBeenCalled()
    expect(h.cookies, 'criou o cookie de visualização com o contador fora').toEqual([])
    expect(h.redirecionou).toBeNull()
  })

  it('com `error`: registra a falha UMA vez, com escopo próprio e SEM o IP em lugar nenhum do argumento', async () => {
    h.rpc = { data: null, error: { code: '08006', message: 'connection failure' } }
    await entrar()
    expect(registrarFalha).toHaveBeenCalledTimes(1)
    const arg = registrarFalha.mock.calls[0]![0] as { escopo: string; ctx?: unknown }
    expect(arg.escopo).toBe('senhas.contador-de-tentativas')
    expect(arg.ctx, 'o contexto da falha não leva nada (o IP é dado pessoal)').toBeUndefined()
    expect(JSON.stringify(arg)).not.toContain(IP)
  })

  it('com `error`: a mensagem é genérica — a MESMA para qualquer senha, e não é a de senha errada', async () => {
    h.rpc = { data: null, error: { code: '08006', message: 'connection failure' } }
    const a = await entrar('uma-senha-ficticia')
    const b = await entrar('outra-senha-ficticia')
    expect(a).toEqual(b)
    const msg = (a as { erro: string }).erro
    expect(msg).not.toBe('Senha inválida.')
    expect(msg).not.toMatch(/muitas tentativas/i)
    expect(msg, 'a mensagem cita o contador — detalhe de infra na porta pública').not.toMatch(/contador|rpc|banco|erro interno/i)
  })

  it('com `data: true`: "Muitas tentativas…", sem ler nem conferir senha', async () => {
    h.rpc = { data: true, error: null }
    const r = await entrar()
    expect(r).toEqual({ erro: 'Muitas tentativas. Aguarde um instante e tente de novo.' })
    expect(h.leuSenhas).toBe(0)
    expect(verificarSenha).not.toHaveBeenCalled()
    expect(registrarFalha).not.toHaveBeenCalled()
    expect(h.cookies).toEqual([])
  })

  it('com `data: false`: segue — lê as senhas ativas, confere, cria o cookie e redireciona', async () => {
    h.rpc = { data: false, error: null }
    const r = await entrar()
    expect(r).toBe('redirecionou')
    expect(h.leuSenhas).toBeGreaterThan(0)
    expect(verificarSenha).toHaveBeenCalled()
    expect(h.cookies.length).toBe(1)
    expect(h.redirecionou).toBe('/relatorios/geral')
    expect(registrarFalha).not.toHaveBeenCalled()
  })
})
