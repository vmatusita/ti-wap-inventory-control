import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/saude/route'
import { VERSOES } from '@/lib/versoes/registry'

// SABOTAGEM C — A SONDA (F55 · Frente B).
//
// A promessa de `/api/saude` é estreita e vale exatamente por ser estreita:
// **200 quando o Postgres responde, 503 quando não responde.** Uma sonda que
// diga "ok" com o banco fora é pior que sonda nenhuma, porque ela transforma
// silêncio em confirmação.
//
// Este arquivo exercita o CAMINHO DE ERRO, que é o que ninguém testa por
// acidente. O caminho feliz contra o banco de verdade é a Parte A do smoke.
//
// ⚠ A OUTRA METADE — "a relação inexistente NÃO diz ok" — está em
// `docs/f55-evidencias/B2-sabotagem-sonda.txt`, batida contra o ENSAIO de
// verdade com a chave publicável. Ela não cabe aqui porque o nome da tabela é
// fixo dentro da rota, e pôr um parâmetro ali só para o teste seria abrir uma
// porta em produção por causa de um teste.

const versaoNoAr = VERSOES[0].versao

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('o caminho de ERRO', () => {
  it('sem configuração da base: 503, e `banco: falha`', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const r = await GET()
    expect(r.status).toBe(503)
    const corpo = await r.json()
    expect(corpo.ok).toBe(false)
    expect(corpo.banco).toBe('falha')
  })

  it('com a base FORA (endereço que não responde): 503', async () => {
    // Um host que não existe: o `fetch` do supabase-js falha, e o `catch` da rota
    // marca `banco: 'falha'`. É o cenário "o Postgres caiu" visto de fora.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://zz-nao-existe-f55.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'chave-falsa-so-para-o-teste')
    const r = await GET()
    expect(r.status).toBe(503)
    const corpo = await r.json()
    expect(corpo).toMatchObject({ ok: false, banco: 'falha' })
  }, 30_000)

  it('mesmo no 503 ela diz a VERSÃO e o COMMIT — é o que torna a falha diagnosticável', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const corpo = await (await GET()).json()
    expect(corpo.versao).toBe(versaoNoAr)
    expect(typeof corpo.commit).toBe('string')
    expect(typeof corpo.ms).toBe('number')
  })
})

describe('o que a resposta NUNCA carrega', () => {
  it('nem no erro: sem stack, sem nome de tabela, sem variável de ambiente, sem schema', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://zz-nao-existe-f55.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'chave-falsa-so-para-o-teste')
    const texto = await (await GET()).text()
    for (const proibido of [
      'filiais', // o nome da tabela que a sonda lê
      'supabase.co', // o endereço
      'SUPABASE', // qualquer nome de variável
      'stack',
      'at ', // início de linha de stack trace
      'migration',
      'PGRST',
    ]) {
      expect(texto, `a resposta vazou "${proibido}"`).not.toContain(proibido)
    }
  }, 30_000)

  it('as chaves da resposta são EXATAMENTE cinco', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const corpo = await (await GET()).json()
    expect(Object.keys(corpo).sort()).toEqual(['banco', 'commit', 'ms', 'ok', 'versao'])
  })
})

describe('a forma da resposta', () => {
  it('não é cacheável — nem pelo header, nem pela declaração de segmento', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const r = await GET()
    expect(r.headers.get('cache-control')).toBe('no-store')
  })

  it('a versão vem do registry, que é a fonte única', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const corpo = await (await GET()).json()
    expect(corpo.versao).toBe(VERSOES[0].versao)
  })
})
