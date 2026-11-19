import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { corpoVigente } from '../../../../scripts/db/corpo-vigente.mjs'

// A FRONTEIRA DO VISUALIZADOR POR SENHA — reescrita na F68 (19/11/2026) para a superfície nova.
//
// ATÉ A v1.75.0 a premissa deste arquivo era: "o visualizador roda sob service_role; para ele o RLS NÃO é a segunda linha
// — o único muro é o próprio CÓDIGO das queries de relatório". Por isso ele enumerava os 11 módulos de query que o client
// do visualizador alcançava, as 9 tabelas e as 7 RPCs. ESSA PREMISSA SAIU (F68, 19/11/2026): o visualizador não recebe
// mais client nenhum de banco além da PORTA PÚBLICA — duas funções `security definer` executáveis SÓ por `anon`
// (`relatorio_publico_abrir`, `relatorio_publico_dados`, migration 0212), chamadas por `src/lib/supabase/publico.ts`, um
// client sem cookie. O muro agora é o BANCO; esta trava garante que o app não abre outra porta ao lado.
//
// DUAS METADES:
//   (mesa TS)  o fecho de imports de RUNTIME da árvore pública (`src/app/r/**`) não alcança `supabase/admin`,
//              `supabase/server`, `auth/acesso` nem `queries/**` (salvo a forma Zod do snapshot — pura, sem client); só
//              `publico.ts` fala com o banco, e ele só chama as duas funções, pela porta única `chamarRpc`; nenhum
//              `.from(`, nenhum `.rpc(`, nenhum service role, nenhum client de sessão.
//   (mesa SQL) o corpo VIGENTE das duas funções (o último `create function` delas nas migrations) só cita tabelas de uma
//              lista branca com motivo — `profiles`, `colaboradores`, `membros` e `auth.users` nunca.
//
// Sabotagem H (docs/f68-evidencias): `createAdminClient` importado na árvore pública, ou o client de sessão em
// `publico.ts`, reprovam aqui.

const RAIZ = process.cwd()
const SRC = join(RAIZ, 'src')
const posix = (p: string) => relative(RAIZ, p).split(sep).join('/')

const ARVORE_PUBLICA = join(SRC, 'app', 'r')
const PUBLICO = 'src/lib/supabase/publico.ts'
const PORTAS = ['relatorio_publico_abrir', 'relatorio_publico_dados'] as const

/** Módulos que a árvore pública NUNCA alcança em runtime. */
const PROIBIDOS = [
  /^src\/lib\/supabase\/admin\.ts$/,
  /^src\/lib\/supabase\/server\.ts$/,
  /^src\/lib\/auth\/acesso\.ts$/,
  /^src\/lib\/queries\//,
]
/** A exceção nominal, com o motivo: a forma Zod do snapshot congelado — Zod puro, sem client, sem leitura. O detalhe do
 *  gerado na porta a usa para validar o snapshot JÁ projetado pela lista branca antes de renderizar. */
const EXCECOES_DE_QUERIES = ['src/lib/queries/formas/relatorios-gerados.ts']

function arquivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivosDe(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

function resolver(de: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(de), spec)
  else return null
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const t = base + ext
    if (existsSync(t) && statSync(t).isFile()) return t
  }
  return null
}

/** Os especificadores de import de RUNTIME (`import type …` some na compilação e não conta). */
export function importsDeRuntime(fonte: string): string[] {
  const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*$/gm, ' ')
  const out: string[] = []
  for (const m of semComentario.matchAll(/(^|\n)\s*(import|export)\s+(type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]/g)) {
    if (!m[3]) out.push(m[4]!)
  }
  for (const m of semComentario.matchAll(/(^|\n)\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[2]!)
  return out
}

function fecho(raizes: string[]): string[] {
  const vistos = new Set<string>()
  const fila = [...raizes]
  while (fila.length) {
    const a = fila.pop()!
    if (vistos.has(a)) continue
    vistos.add(a)
    for (const spec of importsDeRuntime(readFileSync(a, 'utf8'))) {
      const alvo = resolver(a, spec)
      if (alvo && !vistos.has(alvo)) fila.push(alvo)
    }
  }
  return [...vistos].sort()
}

/** As chamadas ao banco num fonte: `chamarRpc(x, 'nome'`, `.rpc(`, `.from('tabela')`. */
export function chamadasAoBanco(fonte: string): { rpcs: string[]; rpcDireta: boolean; tabelas: string[] } {
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  return {
    rpcs: [...codigo.matchAll(/chamarRpc\(\s*[^,]+,\s*'([^']+)'/g)].map((m) => m[1]!),
    rpcDireta: /\.rpc\s*\(/.test(codigo),
    tabelas: [...codigo.matchAll(/\.from\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]!),
  }
}

const RAIZES = arquivosDe(ARVORE_PUBLICA)
const SUPERFICIE = fecho(RAIZES)
const REL = SUPERFICIE.map(posix)

describe('a fronteira da porta pública (mesa TS): a árvore /r/** só fala pelas duas funções', () => {
  it('a árvore pública existe e o fecho segue os imports (sanidade)', () => {
    expect(RAIZES.length).toBeGreaterThanOrEqual(5)
    expect(REL).toContain(PUBLICO)
    expect(REL).toContain('src/lib/actions/porta.ts')
    expect(REL).toContain('src/components/relatorios/corpo-relatorio.tsx')
  })

  it('o fecho de runtime NÃO alcança service role, client de sessão, acesso.ts nem queries/** (salvo a forma Zod, nominal)', () => {
    const fora = REL.filter((r) => PROIBIDOS.some((p) => p.test(r)) && !EXCECOES_DE_QUERIES.includes(r))
    expect(fora, 'a árvore pública alcançou um módulo proibido — a porta é só publico.ts').toEqual([])
  })

  it('nenhum arquivo do fecho cria service role ou client de sessão', () => {
    const achados = SUPERFICIE.flatMap((a) => {
      const f = readFileSync(a, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      return /createAdminClient|createServerClient|SUPABASE_SERVICE_ROLE_KEY|@supabase\/ssr/.test(f) ? [posix(a)] : []
    })
    expect(achados).toEqual([])
  })

  it('só publico.ts chama o banco, e só as duas portas, pela porta única chamarRpc — nenhum .from(, nenhum .rpc(', () => {
    const problemas: string[] = []
    for (const a of SUPERFICIE) {
      const c = chamadasAoBanco(readFileSync(a, 'utf8'))
      const r = posix(a)
      // `rpc.ts` É a porta única (`chamarRpc`): o único `.rpc(` do app mora nele (rpc-unica-porta.test.ts)
      if (c.rpcDireta && r !== 'src/lib/supabase/rpc.ts') problemas.push(`${r}: .rpc( direto`)
      for (const t of c.tabelas) problemas.push(`${r}: .from('${t}')`)
      for (const rpc of c.rpcs) {
        if (r !== PUBLICO) problemas.push(`${r}: chamarRpc('${rpc}') fora de publico.ts`)
        else if (!(PORTAS as readonly string[]).includes(rpc)) problemas.push(`${r}: chamarRpc('${rpc}') não é uma das duas portas`)
      }
    }
    expect(problemas).toEqual([])
    expect(chamadasAoBanco(readFileSync(join(RAIZ, PUBLICO), 'utf8')).rpcs.sort()).toEqual([...PORTAS])
  })

  it('publico.ts é o client SEM sessão: supabase-js puro, chave anon, nada de cookie', () => {
    const f = readFileSync(join(RAIZ, PUBLICO), 'utf8').replace(/\/\/[^\n]*/g, ' ')
    expect(f).toContain("from '@supabase/supabase-js'")
    expect(f).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(f).toMatch(/persistSession:\s*false/)
    expect(f).toMatch(/autoRefreshToken:\s*false/)
    expect(f).toMatch(/detectSessionInUrl:\s*false/)
    expect(f).not.toMatch(/next\/headers|cookies\(|@\/lib\/supabase\/server|@supabase\/ssr|SERVICE_ROLE/)
    expect(f).toMatch(/^import 'server-only'/m)
  })

  it('o detector reprova o que deve (guarda do próprio teste — sabotagem H)', () => {
    expect(importsDeRuntime("import { createAdminClient } from '@/lib/supabase/admin'")).toEqual(['@/lib/supabase/admin'])
    expect(importsDeRuntime("import type { Filial } from '@/lib/queries/filiais'")).toEqual([])
    expect(chamadasAoBanco("await supabase.from('senhas_acesso').select('*')").tabelas).toEqual(['senhas_acesso'])
    expect(chamadasAoBanco("chamarRpc(c, 'papel_atual')").rpcs).toEqual(['papel_atual'])
    expect(chamadasAoBanco("client.rpc('x')").rpcDireta).toBe(true)
    expect(chamadasAoBanco('Array.from(x)').tabelas).toEqual([])
  })
})

describe('a fronteira da porta pública (mesa SQL): o corpo das duas funções só cita tabelas da lista branca', () => {
  /** As tabelas que as duas portas podem tocar, com o motivo. */
  const TABELAS_DA_PORTA: Record<string, string> = {
    'public.empresas': 'o slug da rota → a empresa (abrir) e o nome dela (porta, sessao)',
    'public.senhas_acesso': 'as candidatas bcrypt da empresa (abrir) e a senha ainda ativa (dados)',
    'public.sessoes_visualizador': 'a sessão: criada em abrir, conferida e encerrada em dados',
    'public.porta_tentativas': 'o contador, antes de qualquer senha (abrir)',
    'public.relatorios_gerados': 'os gerados DA EMPRESA DA SESSÃO (dados)',
    'public.filiais': 'o nome das filiais da lista e do filtro (dados)',
    'public.tipos_item': 'o vocabulário dos itens faltantes do snapshot (dados)',
  }
  const NUNCA = ['public.profiles', 'public.colaboradores', 'public.membros', 'auth.users']

  for (const [porta, assinatura] of [
    ['relatorio_publico_abrir', 'public.relatorio_publico_abrir(text, text, text)'],
    ['relatorio_publico_dados', 'public.relatorio_publico_dados(text, text, text, jsonb)'],
  ] as const) {
    it(`${porta}: só tabelas da lista branca, e nunca pessoas`, () => {
      const { sql } = corpoVigente(assinatura)
      const codigo = sql.replace(/--[^\n]*/g, ' ')
      const citadas = [...new Set([...codigo.matchAll(/\b(?:from|join|update|into)\s+((?:public|auth)\.\w+)/gi)].map((m) => m[1]!.toLowerCase()))]
      expect(citadas.length).toBeGreaterThan(0)
      expect(citadas.filter((t) => !Object.hasOwn(TABELAS_DA_PORTA, t)), porta).toEqual([])
      for (const t of NUNCA) expect(codigo.toLowerCase(), `${porta} cita ${t}`).not.toContain(t)
    })
  }

  it('o mesmo trabalho tem o mesmo custo: o sal fictício de abrir tem o custo da criação, e o laço o teto da criação', () => {
    const abrir = corpoVigente('public.relatorio_publico_abrir(text, text, text)').sql
    const criar = corpoVigente('public.senha_acesso_criar(uuid, text, text)').sql
    const custo = /k_custo constant int := (\d+);/.exec(criar)?.[1]
    const sal = /k_sal_ficticio constant text := '\$2a\$(\d\d)\$[./A-Za-z0-9]{22}';/.exec(abrir)?.[1]
    expect(custo).toBeDefined()
    expect(Number(sal)).toBe(Number(custo))
    const teto = /k_max_ativas constant int := (\d+);/.exec(criar)?.[1]
    const laco = /k_max_candidatas constant int := (\d+);/.exec(abrir)?.[1]
    expect(laco).toBe(teto)
  })
})
