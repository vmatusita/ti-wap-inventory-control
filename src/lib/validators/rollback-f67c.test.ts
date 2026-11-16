import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { funcoesVigentes, lerMigrations } from '../../../scripts/db/cargo-congelado.mjs'
import { semComentarios, textoExecutadoMascarado } from '../../../scripts/db/classificar-migration.mjs'

// =============================================================================
// O ROLLBACK DA F67C DEVOLVE O ESQUEMA DE ANTES DA 0200 — a completude, na mesa (16/11/2026)
// =============================================================================
// O ensaio do rollback roda no CI (`supabase/tests/f67c_rollback.sql`: a impressão das funções — com a ACL de cada papel —,
// das policies, das views, dos gatilhos, dos comentários E dos defaults das colunas volta à da cadeia até a 0199, nos dois
// estados de produção; o arquivo rodado de novo não muda nada). O que o ensaio não vê é a COMPLETUDE contra as
// migrations: uma função que a F67C recriou e o rollback esqueceu, a assinatura nova que ficou de pé, uma das 20 tabelas
// sem o default de volta. Aqui, sem banco, no molde de `rollback-f67b.test.ts`: cada corpo volta BYTE A BYTE ao vigente
// antes da 0200, a assinatura nova sai, a antiga volta com corpo/comentário/ACL da 0196, e as 20 de `k_negocio` recebem
// `set default public.empresa_legada()`.
//
// ⚠ Este teste lê as oito migrations da F67C (0200–0207) do diretório `supabase/migrations/`: a contração (0205–0207) é
// o que o universo das derrubadas e dos defaults enxerga.
// =============================================================================

const RAIZ = process.cwd()
const MIGRATIONS = lerMigrations(RAIZ) as { arquivo: string; sql: string }[]
const DESFAZ = readFileSync(join(RAIZ, 'supabase', 'rollback', 'F67C-desfaz.sql'), 'utf8').replace(/\r\n/g, '\n')
const CODIGO = semComentarios(DESFAZ) as string
const PRIMEIRA = '0200'
const DEPOIS_DA_ULTIMA = '0208'
const ASSIN_ANTIGA = 'public.registrar_limpeza_termos_sem_linha(text, text, text)'

const ANTES = funcoesVigentes(MIGRATIONS, PRIMEIRA)
const daF67C = MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) >= PRIMEIRA && m.arquivo.slice(0, 4) < DEPOIS_DA_ULTIMA)
const antesDaF67C = MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) < PRIMEIRA)
const temContracao = ['0205', '0206', '0207'].every((p) => daF67C.some((m) => m.arquivo.startsWith(p)))

/** As definições de função (nome/aridade) de um texto SQL — a chave de `funcoesVigentes`. */
function definidas(sql: string): string[] {
  const out: string[] = []
  const codigo = semComentarios(sql) as string
  for (const m of codigo.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(([^)]*)\)/gi)) {
    const args = m[2].trim() === '' ? 0 : m[2].split(',').length
    out.push(`${m[1]}/${args}`)
  }
  return out
}
/** As assinaturas derrubadas por `drop function [if exists] public.x(tipos)`. */
function derrubadas(sql: string): string[] {
  const codigo = semComentarios(sql) as string
  return [...codigo.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.([a-z_0-9]+)\s*\(([^)]*)\)/gi)].map(
    (m) => `${m[1]}/${m[2].trim() === '' ? 0 : m[2].split(',').length}`,
  )
}

const criadasOuRecriadas = [...new Set(daF67C.flatMap((m) => definidas(m.sql)))]
const recriadasNoLugar = criadasOuRecriadas.filter((k) => ANTES.has(k as `${string}/${number}`)).sort()
const novas = criadasOuRecriadas.filter((k) => !ANTES.has(k as `${string}/${number}`)).sort()
const contracao = daF67C.filter((m) => m.arquivo >= '0205').flatMap((m) => derrubadas(m.sql)).sort()
const devolvidas = [...new Set([...recriadasNoLugar, ...contracao])].sort()

/** O número de argumentos da assinatura que abre em `sql[abre]` (um `(`): varre até o fecho balanceado, pulando comentários de linha. */
function aridade(sql: string, abre: number): { n: number; fim: number } {
  let prof = 0
  let n = 0
  let vazio = true
  for (let i = abre; i < sql.length; i++) {
    const c = sql[i]
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    if (c === '(') prof++
    else if (c === ')') {
      prof--
      if (prof === 0) return { n: vazio ? 0 : n + 1, fim: i }
    } else if (c === ',' && prof === 1) n++
    else if (prof >= 1 && !/\s/.test(c)) vazio = false
  }
  return { n: -1, fim: -1 }
}

/** O corpo entre os dollar-quotes da definição de `nome` com `n` argumentos num texto SQL (o que o `prosrc` guarda). */
function corpo(sql: string, chave: string): string | null {
  const [nome, n] = chave.split('/')
  const re = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+public\.${nome}\s*\(`, 'gi')
  for (const m of sql.matchAll(re)) {
    const a = aridade(sql, m.index! + m[0].length - 1)
    if (String(a.n) !== n) continue
    const resto = sql.slice(a.fim)
    const abre = /\$([a-z_]*)\$/i.exec(resto)
    if (!abre) return null
    const inicio = a.fim + abre.index + abre[0].length
    const fimCorpo = sql.indexOf(abre[0], inicio)
    return fimCorpo < 0 ? null : sql.slice(inicio, fimCorpo)
  }
  return null
}

/** O `comment on function <assin> is '…';` de um texto SQL (o último), com o ponto e vírgula. */
function comentario(sql: string, assin: string): string | null {
  const marca = `comment on function ${assin} is`
  const i = sql.lastIndexOf(marca)
  if (i < 0) return null
  const fim = sql.indexOf("';\n", i)
  return fim < 0 ? null : sql.slice(i, fim + 2)
}

/** As 20 tabelas de `k_negocio`, lidas do roteiro de catálogo (a fonte única da lista). */
function kNegocio(): string[] {
  const sql = readFileSync(join(RAIZ, 'supabase', 'tests', 'catalogo_policies.sql'), 'utf8')
  const m = /k_negocio\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(sql)
  expect(m, 'k_negocio não achado em catalogo_policies.sql').not.toBeNull()
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()
}

describe('o rollback da F67C (supabase/rollback/F67C-desfaz.sql) é COMPLETO contra as migrations', () => {
  it('o universo (guarda do próprio teste): 17 recriadas no lugar, 1 derrubada pela contração, 1 nova — 18 devolvidas', () => {
    expect(temContracao, 'a contração (0205–0207) não está em supabase/migrations/').toBe(true)
    expect(recriadasNoLugar).toHaveLength(17)
    expect(contracao).toEqual(['registrar_limpeza_termos_sem_linha/3'])
    expect(novas).toEqual(['registrar_limpeza_termos_sem_linha/4'])
    expect(devolvidas).toHaveLength(18)
    expect(devolvidas).toContain('registrar_limpeza_termos_sem_linha/3')
    expect(devolvidas).toContain('import_gravar_trilha/10')
  })

  it.each(devolvidas)('%s volta com o corpo vigente ANTES da 0200, byte a byte', (chave) => {
    const antes = ANTES.get(chave as `${string}/${number}`)
    expect(antes, `${chave} não existia antes da 0200`).toBeDefined()
    const original = corpo(antes!.texto.replace(/\r\n/g, '\n'), chave)
    expect(original, `não achei o corpo de ${chave} em ${antes!.arquivo}`).not.toBeNull()
    expect(corpo(DESFAZ, chave), `${chave} não volta byte a byte no rollback`).toBe(original)
  })

  it('o rollback recria EXATAMENTE as devolvidas (nenhuma a mais), sempre com create or replace', () => {
    expect([...new Set(definidas(DESFAZ))].sort()).toEqual(devolvidas)
    expect(CODIGO).not.toMatch(/create\s+function\b/i)
  })

  it('a assinatura NOVA da ferramenta de órfão (uuid, text, text, text) sai com drop … if exists (e nenhuma antiga sai)', () => {
    expect([...new Set(derrubadas(DESFAZ))].sort()).toEqual(novas)
    expect(CODIGO).toMatch(/drop function if exists public\.registrar_limpeza_termos_sem_linha\(uuid, text, text, text\);/)
    expect(CODIGO).not.toMatch(/drop\s+function\s+(?!if\s+exists)/i)
  })

  it('a ferramenta de órfão ANTIGA volta com o comentário e a ACL da 0196, byte a byte', () => {
    const m0196 = MIGRATIONS.find((m) => m.arquivo.startsWith('0196'))!
    const t0196 = m0196.sql.replace(/\r\n/g, '\n')
    const c0196 = comentario(t0196, 'public.registrar_limpeza_termos_sem_linha(text, text, text)')
    expect(c0196).not.toBeNull()
    expect(comentario(DESFAZ, 'public.registrar_limpeza_termos_sem_linha(text, text, text)')).toBe(c0196)
    for (const prefixo of ['revoke all on function ' + ASSIN_ANTIGA, 'grant execute on function ' + ASSIN_ANTIGA]) {
      const linha = t0196.split('\n').find((l) => l.startsWith(prefixo))
      expect(linha, `a 0196 não tem "${prefixo}"`).toBeDefined()
      expect(DESFAZ.split('\n'), `o rollback não repete a linha da 0196: ${linha}`).toContain(linha)
    }
    // a ACL repete só de quem a 0196 revoga/concede: nenhuma ferramenta nova sai do rollback com EXECUTE a mais
    expect(CODIGO).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.registrar_limpeza_termos_sem_linha\(uuid/i)
  })

  it('as 20 tabelas de k_negocio recebem `set default public.empresa_legada()` — uma por comando, nem uma a mais', () => {
    const tabelas = kNegocio()
    expect(tabelas).toHaveLength(20)
    const sets = [...CODIGO.matchAll(/^alter table public\.([a-z_]+) alter column empresa_id set default public\.empresa_legada\(\);$/gm)].map((m) => m[1])
    expect([...sets].sort()).toEqual(tabelas)
    expect(new Set(sets).size).toBe(20)
    // e nada além do default entra em `alter table`
    expect([...CODIGO.matchAll(/^alter table\b.*$/gim)]).toHaveLength(20)
    // as 20 são exatamente as que a contração (0205–0207) tirou
    const tiradas = daF67C
      .filter((m) => m.arquivo >= '0205')
      .flatMap((m) => [...(semComentarios(m.sql) as string).matchAll(/alter table public\.([a-z_]+) alter column empresa_id drop default;/g)].map((x) => x[1]))
    expect([...tiradas].sort()).toEqual(tabelas)
  })

  it('a ordem dos blocos é 0207 → 0206 → 0205 → 0204 → 0203 → 0202 → 0201 → 0200, e os defaults vêm ANTES de toda função', () => {
    const passos = [...DESFAZ.matchAll(/^-- (02\d\d) (?:\((?:a contração|a expansão)\) )?—/gm)].map((m) => m[1])
    expect(passos).toEqual(['0207', '0206', '0205', '0204', '0203', '0202', '0201', '0200'])
    // o primeiro passo é o default de filiais (0207): sozinho já devolve o comportamento de antes
    const primeiro = CODIGO.search(/alter table public\.filiais alter column empresa_id set default/)
    const primeiraFuncao = CODIGO.search(/create or replace function/i)
    expect(primeiro).toBeGreaterThan(-1)
    expect(primeiro).toBeLessThan(primeiraFuncao)
    // a ordem dos três blocos de default: filiais, depois as onze, depois as oito
    const pos = (t: string) => CODIGO.indexOf(`alter table public.${t} alter column`)
    expect(pos('filiais')).toBeLessThan(pos('eventos_admin'))
    expect(pos('unidades_apelidos')).toBeLessThan(pos('anotacoes'))
  })

  it('só catálogo: nada de update/delete/insert/truncate/cascade/begin/commit; lock_timeout por set/reset', () => {
    const executado = textoExecutadoMascarado(DESFAZ) as string
    expect(executado).not.toMatch(/\b(update|delete|insert|truncate|cascade|commit|rollback)\b/i)
    expect(CODIGO).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im)
    expect(CODIGO).toMatch(/^set lock_timeout = '2s';/m)
    expect(CODIGO).toMatch(/^reset lock_timeout;/m)
    expect(CODIGO.match(/^set lock_timeout/gm)).toHaveLength(1)
    expect(CODIGO.match(/^reset lock_timeout;/gm)).toHaveLength(1)
  })

  it('os roteiros de rollback das fases anteriores rodam o da F67C IMEDIATAMENTE antes do primeiro da F67B', () => {
    for (const fase of ['f62', 'f63', 'f64', 'f65', 'f66', 'f67', 'f67b']) {
      const sql = readFileSync(join(RAIZ, 'supabase', 'tests', `${fase}_rollback.sql`), 'utf8').replace(/\r\n/g, '\n')
      const inclui = [...sql.matchAll(/^\\ir \.\.\/rollback\/(F\d\d[^\s]*)\.sql$/gm)].map((m) => m[1])
      const iB = inclui.indexOf('F67B-desfaz')
      expect(iB, `${fase}_rollback.sql não roda o F67B-desfaz`).toBeGreaterThan(0)
      expect(inclui[iB - 1], `${fase}_rollback.sql: o F67C-desfaz não precede o primeiro F67B-desfaz`).toBe('F67C-desfaz')
      expect(inclui.filter((x) => x === 'F67C-desfaz'), fase).toHaveLength(1)
    }
  })

  it('o ensaio f67c_rollback.sql roda o arquivo três vezes (contraído, de novo, só-expansão), reaplica as cinco da expansão e emite UMA linha FIM', () => {
    const sql = readFileSync(join(RAIZ, 'supabase', 'tests', 'f67c_rollback.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(sql.match(/^\\ir \.\.\/rollback\/F67C-desfaz\.sql$/gm)).toHaveLength(3)
    const expansao = daF67C.map((m) => m.arquivo).filter((a) => a < '0205')
    expect(expansao).toHaveLength(5)
    for (const a of expansao) expect(sql).toContain(`\\ir ../migrations/${a}\n`)
    expect(sql).not.toMatch(/\\ir \.\.\/migrations\/020[567]_/)
    // a impressão tem a parte dos defaults e toda ordenação é por collate "C" (a mesma constante na mesa e no CI)
    expect(sql).toContain("select 'defaults'")
    expect(sql).not.toMatch(/order by (x|parte)\)/)
    expect(sql.match(/order by (x|parte) collate "C"\)/g)!.length).toBeGreaterThanOrEqual(7)
    const linhas = sql.split('\n')
    expect(linhas.filter((l) => l.includes("'FIM f67c_rollback:")).length).toBe(1)
    for (const r of ['rc7', 'rc8', 'rc9', 'rc10', 'rc11']) expect(sql).toMatch(new RegExp(String.raw`assert_zero_de\('${r} `))
    for (const r of ['rc1', 'rc2', 'rc3', 'rc4', 'rc5', 'rc6']) expect(sql).toMatch(new RegExp(String.raw`'${r} `))
  })

  it('guarda: a cadeia anterior à F67C ainda tem a ferramenta antiga e nenhuma recriada nasce na F67C sem aparecer em ANTES', () => {
    expect(antesDaF67C.length).toBeGreaterThan(190)
    expect(ANTES.has('registrar_limpeza_termos_sem_linha/3' as `${string}/${number}`)).toBe(true)
  })
})
