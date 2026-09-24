import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { funcoesVigentes, lerMigrations } from '../../../scripts/db/cargo-congelado.mjs'
import { replayPolicies } from '../../../scripts/db/predicado-policies.mjs'

// =============================================================================
// O ROLLBACK DA F66 DEVOLVE AS POLICIES E AS rel_* DE ANTES DA 0175 — a completude, na mesa (24/09/2026)
// =============================================================================
// O ensaio do rollback roda no CI (`supabase/tests/f66_rollback.sql`: a impressão das policies e o `prosrc` das duas
// `rel_*` voltam ao "antes" dos DOIS bancos vivos, e o arquivo rodado de novo não muda nada). O que o ensaio não vê é a
// COMPLETUDE contra as migrations, cláusula a cláusula — uma policy que a F66 reescreveu e o rollback esqueceu, um
// `with check` devolvido no lugar do `using`, uma exceção da 0069 perdida. Aqui, sem banco, no molde de
// `rollback-f65.test.ts`: o `F66-desfaz.sql` passa pelo MESMO replay da trava de mesa (`predicado-policies.mjs`) em cima
// da cadeia inteira, e cada policy de `public` e de Storage sai com o texto que tinha ANTES da 0175 (espaço normalizado);
// e cada função que a F66 recriou volta com o corpo vigente antes da 0175, BYTE A BYTE.
// =============================================================================

const RAIZ = process.cwd()
const MIGRATIONS = lerMigrations(RAIZ) as { arquivo: string; sql: string }[]
const DESFAZ = readFileSync(join(RAIZ, 'supabase', 'rollback', 'F66-desfaz.sql'), 'utf8').replace(/\r\n/g, '\n')
const PRIMEIRA_DA_F66 = '0175'
const PRIMEIRA_DEPOIS_DA_F66 = '0180'

const ANTES = funcoesVigentes(MIGRATIONS, PRIMEIRA_DA_F66)
const DEPOIS = funcoesVigentes(MIGRATIONS, PRIMEIRA_DEPOIS_DA_F66)
const DA_F66 = [...DEPOIS].filter(([, f]) => f.arquivo.slice(0, 4) >= PRIMEIRA_DA_F66)
const recriadas = DA_F66.filter(([k]) => ANTES.has(k)).map(([k]) => k).sort()
const criadas = DA_F66.filter(([k]) => !ANTES.has(k)).map(([k]) => k).sort()

const antesDaF66 = MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) < PRIMEIRA_DA_F66)
const daF66 = MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) >= PRIMEIRA_DA_F66 && m.arquivo.slice(0, 4) < PRIMEIRA_DEPOIS_DA_F66)
const POL_ANTES = replayPolicies(antesDaF66)
const POL_COM_F66 = replayPolicies(MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) < PRIMEIRA_DEPOIS_DA_F66))
const POL_DESFEITO = replayPolicies([
  ...MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) < PRIMEIRA_DEPOIS_DA_F66),
  { arquivo: '9999_F66-desfaz.sql', sql: DESFAZ },
])
const CODIGO_DESFAZ = DESFAZ.replace(/--[^\n]*/g, '')

const norm = (t: string | null | undefined) => (t == null ? null : t.replace(/\s+/g, ' ').trim())

/** As policies que as migrations da F66 reescreveram, e as cláusulas de cada uma. */
const reescritas = new Map<string, { using: boolean; withCheck: boolean }>()
for (const m of daF66) {
  for (const x of m.sql.replace(/\r\n/g, '\n').matchAll(/^alter policy "([^"]+)" on public\.(\w+)\n([\s\S]*?);\n/gm)) {
    reescritas.set(`public.${x[2]} / ${x[1]}`, { using: /^\s*using\b/m.test(x[3]), withCheck: /with check/.test(x[3]) })
  }
}

/** O corpo entre os dollar-quotes da definição de `nome` num texto SQL (o que o `prosrc` guarda). */
function corpo(sql: string, nome: string): string | null {
  const ini = sql.search(new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+public\.${nome}\s*\(`, 'i'))
  if (ini < 0) return null
  const abre = /\$([a-z_]*)\$/i.exec(sql.slice(ini))
  if (!abre) return null
  const inicio = ini + abre.index + abre[0].length
  const fim = sql.indexOf(abre[0], inicio)
  return fim < 0 ? null : sql.slice(inicio, fim)
}

describe('o rollback da F66 (supabase/rollback/F66-desfaz.sql) é COMPLETO contra as migrations', () => {
  it('a F66 reescreveu 51 policies e recriou as duas rel_*, sem criar função (guarda do próprio teste)', () => {
    expect(reescritas.size).toBe(51)
    expect(recriadas).toEqual(['rel_por_motivo_filiais/3', 'rel_resumo_filiais/3'])
    expect(criadas).toEqual([])
    expect(POL_ANTES.falhas).toEqual([])
    expect(POL_DESFEITO.falhas).toEqual([])
  })

  it.each(recriadas)('%s volta com o corpo vigente ANTES da 0175, byte a byte', (chave) => {
    const nome = chave.split('/')[0]
    const antes = ANTES.get(chave as `${string}/${number}`)!
    const original = corpo(antes.texto.replace(/\r\n/g, '\n'), nome)
    expect(original, `não achei o corpo de ${nome} em ${antes.arquivo}`).not.toBeNull()
    expect(corpo(DESFAZ, nome), `${nome} não volta byte a byte no rollback`).toBe(original)
  })

  it('o rollback reescreve EXATAMENTE as 51 da F66, e só as cláusulas que a F66 trocou', () => {
    const doDesfaz = new Map<string, { using: boolean; withCheck: boolean }>()
    for (const x of DESFAZ.matchAll(/^alter policy "([^"]+)" on public\.(\w+)\n([\s\S]*?);\n/gm)) {
      doDesfaz.set(`public.${x[2]} / ${x[1]}`, { using: /^\s*using\b/m.test(x[3]), withCheck: /^\s*with check\b/m.test(x[3]) })
    }
    expect([...doDesfaz.keys()].sort()).toEqual([...reescritas.keys()].sort())
    for (const [chave, c] of reescritas) expect(doDesfaz.get(chave), chave).toEqual(c)
  })

  it.each([...POL_ANTES.vivas.keys()].sort())('%s sai do rollback com o texto de antes da 0175', (chave) => {
    const antes = POL_ANTES.vivas.get(chave)
    const depois = POL_DESFEITO.vivas.get(chave)
    expect(depois, `${chave} sumiu`).toBeDefined()
    expect(norm(depois.using), `${chave} (using)`).toBe(norm(antes.using))
    expect(norm(depois.withCheck), `${chave} (with check)`).toBe(norm(antes.withCheck))
  })

  it('o universo é o mesmo antes e depois (nenhuma policy nova, nenhuma sumida), e a F66 de fato mudou as 51', () => {
    expect([...POL_DESFEITO.vivas.keys()].sort()).toEqual([...POL_ANTES.vivas.keys()].sort())
    const mudadas = [...POL_COM_F66.vivas.keys()].filter((k) => {
      const a = POL_ANTES.vivas.get(k)
      const f = POL_COM_F66.vivas.get(k)
      return norm(a.using) !== norm(f.using) || norm(a.withCheck) !== norm(f.withCheck)
    })
    expect(mudadas.sort()).toEqual([...reescritas.keys()].sort())
  })

  it('só alter policy e create or replace function: nada de drop, update, cascade, begin/commit; lock_timeout por set/reset', () => {
    const comandos = CODIGO_DESFAZ.replace(/\$\$[\s\S]*?\$\$/g, '$$$$')
      .split(';')
      .map((c) => c.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    for (const c of comandos) {
      expect(c, c.slice(0, 80)).toMatch(/^(alter policy "[^"]+" on public\.\w+ |create or replace function public\.rel_(por_motivo|resumo)_filiais\(|set lock_timeout = '2s'$|reset lock_timeout$)/)
    }
    expect(CODIGO_DESFAZ).not.toMatch(/\b(drop|update|delete|cascade|truncate|begin|commit)\b/i)
    expect(CODIGO_DESFAZ).toMatch(/^set lock_timeout = '2s';/m)
    expect(CODIGO_DESFAZ).toMatch(/^reset lock_timeout;/m)
  })

  it('os passos saem na ORDEM INVERSA do apply (0179 primeiro, 0175 por último)', () => {
    const passos = [...DESFAZ.matchAll(/^-- (\d)\. \((01\d\d)\)/gm)].map((m) => m[2])
    expect(passos).toEqual(['0179', '0178', '0177', '0176', '0175'])
  })

  it('os roteiros de rollback das fases anteriores rodam o da F66 ANTES do deles (a ordem inversa entre fases)', () => {
    for (const fase of ['f65', 'f64', 'f63', 'f62']) {
      const sql = readFileSync(join(RAIZ, 'supabase', 'tests', `${fase}_rollback.sql`), 'utf8')
      const inclui = [...sql.matchAll(/^\\ir \.\.\/rollback\/(F\d\d[^\s]*)\.sql$/gm)].map((m) => m[1])
      const f66 = inclui.map((x, i) => (x === 'F66-desfaz' ? i : -1)).filter((i) => i >= 0)
      expect(f66.length, `${fase}_rollback.sql não roda o F66-desfaz`).toBeGreaterThan(0)
      // cada F66-desfaz vem imediatamente antes de um F65-desfaz, e não há F65-desfaz sem ele antes
      for (const i of f66) expect(inclui[i + 1], `${fase}_rollback.sql: o F66-desfaz não precede o F65-desfaz`).toBe('F65-desfaz')
      expect(inclui.filter((x) => x === 'F65-desfaz').length, fase).toBe(f66.length)
    }
  })

  it('o ensaio f66_rollback.sql roda o arquivo duas vezes e emite UMA linha FIM fechando o bloco', () => {
    const sql = readFileSync(join(RAIZ, 'supabase', 'tests', 'f66_rollback.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(sql.match(/^\\ir \.\.\/rollback\/F66-desfaz\.sql$/gm)).toHaveLength(2)
    const linhas = sql.split('\n')
    const i = linhas.findIndex((l) => l.includes("raise notice 'FIM f66_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;"))
    expect(i).toBeGreaterThan(-1)
    expect(linhas.filter((l) => l.includes("'FIM f66_rollback:")).length).toBe(1)
    expect((linhas[i + 1] ?? '').trim()).toMatch(/^end(\s*\$\$;)?$/)
    for (const r of ['rb0', 'rb1', 'rb2', 'rb3', 'rb4', 'rb5']) expect(sql).toMatch(new RegExp(String.raw`assert_zero_de\('${r} `))
  })
})
