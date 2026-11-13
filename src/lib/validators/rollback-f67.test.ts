import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { funcoesVigentes, lerMigrations } from '../../../scripts/db/cargo-congelado.mjs'
import { semComentarios, textoExecutadoMascarado } from '../../../scripts/db/classificar-migration.mjs'
import { fimDoComando } from '../../../scripts/db/corpo-vigente.mjs'
import { replayPolicies } from '../../../scripts/db/predicado-policies.mjs'

// =============================================================================
// O ROLLBACK DA F67 DEVOLVE O ESQUEMA DE ANTES DA 0185 — a completude, na mesa (13/11/2026)
// =============================================================================
// O ensaio do rollback roda no CI (`supabase/tests/f67_rollback.sql`: a impressão das funções — com a ACL de cada papel —,
// das policies, das views e dos gatilhos volta à do CI antes da 0185, nos dois estados de produção, e o arquivo rodado de
// novo não muda nada). O que o ensaio não vê é a COMPLETUDE contra as migrations: uma função que a F67 recriou e o
// rollback esqueceu, uma nova que ficou de pé, uma policy devolvida com a cláusula trocada, a view com outro texto. Aqui,
// sem banco, no molde de `rollback-f66.test.ts`: cada corpo volta BYTE A BYTE ao vigente antes da 0185, cada função nova
// sai, as nove policies voltam ao texto do replay da trava de mesa, as duas views ao texto da 0134/0092.
// =============================================================================

const RAIZ = process.cwd()
const MIGRATIONS = lerMigrations(RAIZ) as { arquivo: string; sql: string }[]
const DESFAZ = readFileSync(join(RAIZ, 'supabase', 'rollback', 'F67-desfaz.sql'), 'utf8').replace(/\r\n/g, '\n')
const CODIGO = semComentarios(DESFAZ) as string
const PRIMEIRA = '0185'
const DEPOIS_DA_ULTIMA = '0194'

const ANTES = funcoesVigentes(MIGRATIONS, PRIMEIRA)
const daF67 = MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) >= PRIMEIRA && m.arquivo.slice(0, 4) < DEPOIS_DA_ULTIMA)
const antesDaF67 = MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) < PRIMEIRA)

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

const criadasOuRecriadas = [...new Set(daF67.flatMap((m) => definidas(m.sql)))]
const recriadasNoLugar = criadasOuRecriadas.filter((k) => ANTES.has(k as `${string}/${number}`)).sort()
const novas = criadasOuRecriadas.filter((k) => !ANTES.has(k as `${string}/${number}`)).sort()
const contracao = derrubadas(daF67.find((m) => m.arquivo.startsWith('0193'))!.sql).sort()
const devolvidas = [...new Set([...recriadasNoLugar, ...contracao])].sort()

/** O corpo entre os dollar-quotes da definição de `nome` com `n` argumentos num texto SQL (o que o `prosrc` guarda). */
function corpo(sql: string, chave: string): string | null {
  const [nome, n] = chave.split('/')
  const re = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+public\.${nome}\s*\(([^)]*)\)`, 'gi')
  for (const m of sql.matchAll(re)) {
    const args = m[1].trim() === '' ? 0 : m[1].split(',').length
    if (String(args) !== n) continue
    const resto = sql.slice(m.index!)
    const abre = /\$([a-z_]*)\$/i.exec(resto)
    if (!abre) return null
    const inicio = m.index! + abre.index + abre[0].length
    const fim = sql.indexOf(abre[0], inicio)
    return fim < 0 ? null : sql.slice(inicio, fim)
  }
  return null
}

const norm = (t: string | null | undefined) => (t == null ? null : t.replace(/\s+/g, ' ').trim())

/** A view `nome` num texto SQL (o último `create [or replace] view`), sem o `or replace`. */
function view(sql: string, nome: string): string | null {
  const re = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?view\s+public\.${nome}\b`, 'gi')
  let ult = -1
  for (const m of sql.matchAll(re)) ult = m.index!
  if (ult < 0) return null
  const fim = fimDoComando(sql, ult)
  return fim < 0 ? null : sql.slice(ult, fim).replace(/^create\s+or\s+replace\s+view/i, 'create view')
}

describe('o rollback da F67 (supabase/rollback/F67-desfaz.sql) é COMPLETO contra as migrations', () => {
  it('o universo (guarda do próprio teste): 12 recriadas no lugar (as 9 de corpo novo e as 3 antigas com a chave de advisory por empresa), 21 derrubadas pela contração, 29 novas — 30 devolvidas', () => {
    expect(recriadasNoLugar).toHaveLength(12)
    expect(devolvidas).toHaveLength(30)
    expect(contracao).toHaveLength(21)
    expect(novas).toHaveLength(29)
    expect(contracao).toContain('e_dev/0')
  })

  it.each(devolvidas)('%s volta com o corpo vigente ANTES da 0185, byte a byte', (chave) => {
    const antes = ANTES.get(chave as `${string}/${number}`)
    expect(antes, `${chave} não existia antes da 0185`).toBeDefined()
    const original = corpo(antes!.texto.replace(/\r\n/g, '\n'), chave)
    expect(original, `não achei o corpo de ${chave} em ${antes!.arquivo}`).not.toBeNull()
    expect(corpo(DESFAZ, chave), `${chave} não volta byte a byte no rollback`).toBe(original)
  })

  it('o rollback recria EXATAMENTE as devolvidas (nenhuma a mais), sempre com create or replace', () => {
    expect([...new Set(definidas(DESFAZ))].sort()).toEqual(devolvidas)
    expect(CODIGO).not.toMatch(/create\s+function\b/i)
  })

  it('toda função NOVA da F67 sai com drop … if exists (e nenhuma antiga sai)', () => {
    expect([...new Set(derrubadas(DESFAZ))].sort()).toEqual(novas)
    expect(CODIGO).not.toMatch(/drop\s+function\s+(?!if\s+exists)/i)
  })

  it('a trava do termo sai: o gatilho (drop trigger if exists) e as duas funções da 0192', () => {
    expect(CODIGO).toMatch(/drop trigger if exists termo_exige_modelo_da_empresa on public\.termos_gerados;/)
    expect(novas).toEqual(expect.arrayContaining(['empresas_com_modelo_de_termo/0', 'termo_exige_modelo_da_empresa/0']))
  })

  it('as nove policies que a 0187 reescreveu voltam ao texto de antes da 0185 (o replay da trava de mesa), cláusula a cláusula', () => {
    const reescritas = new Map<string, { using: boolean; withCheck: boolean }>()
    for (const x of daF67.find((m) => m.arquivo.startsWith('0187'))!.sql.replace(/\r\n/g, '\n').matchAll(/^alter policy "([^"]+)" on (\w+)\.(\w+)\n([\s\S]*?);\n/gm)) {
      reescritas.set(`${x[2]}.${x[3]} / ${x[1]}`, { using: /^\s*using\b/m.test(x[4]), withCheck: /with check/.test(x[4]) })
    }
    expect(reescritas.size).toBe(9)
    const doDesfaz = new Map<string, { using: string | null; withCheck: string | null }>()
    for (const x of DESFAZ.matchAll(/^alter policy "([^"]+)" on (\w+)\.(\w+)((?:\n {2}(?:using|with check) [\s\S]*?)+);\n/gm)) {
      const u = /\n {2}using \(([\s\S]*?)\)(?=\n {2}with check|$)/.exec(x[4])
      const w = /\n {2}with check \(([\s\S]*)\)$/.exec(x[4])
      doDesfaz.set(`${x[2]}.${x[3]} / ${x[1]}`, { using: u ? u[1] : null, withCheck: w ? w[1] : null })
    }
    expect([...doDesfaz.keys()].sort()).toEqual([...reescritas.keys()].sort())
    const antes = replayPolicies(antesDaF67)
    expect(antes.falhas).toEqual([])
    for (const [chave, c] of reescritas) {
      const a = antes.vivas.get(chave)
      const d = doDesfaz.get(chave)!
      expect(a, `${chave} não existia antes da 0185`).toBeDefined()
      expect(d.using !== null, `${chave}: using`).toBe(c.using)
      expect(d.withCheck !== null, `${chave}: with check`).toBe(c.withCheck)
      expect(norm(d.using), `${chave} (using)`).toBe(norm(a.using))
      expect(norm(d.withCheck), `${chave} (with check)`).toBe(norm(a.withCheck))
    }
  })

  it('as duas views da mesa voltam ao texto da 0134 (v_conflitos_filiais) e da 0092 (grupos), e a ACL delas é guardada antes do drop', () => {
    const v134 = view(antesDaF67.find((m) => m.arquivo.startsWith('0134'))!.sql.replace(/\r\n/g, '\n'), 'v_conflitos_filiais')
    const v092 = view(antesDaF67.find((m) => m.arquivo.startsWith('0092'))!.sql.replace(/\r\n/g, '\n'), 'v_conflitos_filiais_grupos')
    expect(view(DESFAZ, 'v_conflitos_filiais')).toBe(v134)
    expect(view(DESFAZ, 'v_conflitos_filiais_grupos')).toBe(v092)
    // a ordem: a ACL guardada, a de grupos sai antes da base, e a ACL volta depois das duas
    const iAcl = CODIGO.indexOf('create temp table f67_desfaz_acl_views')
    const iDropG = CODIGO.indexOf('drop view public.v_conflitos_filiais_grupos;')
    const iDropB = CODIGO.indexOf('drop view public.v_conflitos_filiais;')
    const iCriaG = CODIGO.indexOf('create view public.v_conflitos_filiais_grupos')
    const iGrant = CODIGO.indexOf("execute format('grant %s on public.%I to %s%s'")
    expect(iAcl).toBeGreaterThan(-1)
    expect(iAcl < iDropG && iDropG < iDropB && iDropB < iCriaG && iCriaG < iGrant).toBe(true)
    expect(CODIGO).toMatch(/drop table f67_desfaz_acl_views;/)
  })

  it('os passos saem na ORDEM INVERSA do apply (0193 primeiro, 0185 por último)', () => {
    const passos = [...DESFAZ.matchAll(/^-- (01\d\d) (?:\(a contração\) )?—/gm)].map((m) => m[1])
    expect(passos).toEqual(['0193', '0192', '0191', '0190', '0189', '0188', '0187', '0186', '0185'])
  })

  it('só catálogo: nada de update/delete/insert/truncate/cascade/begin/commit; lock_timeout por set/reset', () => {
    // o texto que o apply EXECUTA, com os textos entre aspas mascarados (sem comentário, sem corpo de função, sem a prosa
    // dos `comment on`; com o corpo do `do` que devolve a ACL das views)
    const executado = textoExecutadoMascarado(DESFAZ) as string
    expect(executado).not.toMatch(/\b(update|delete|insert|truncate|cascade|commit|rollback)\b/i)
    expect(CODIGO).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im)
    expect(executado).toMatch(/\bexecute format\(/)
    expect(CODIGO).toMatch(/^set lock_timeout = '2s';/m)
    expect(CODIGO).toMatch(/^reset lock_timeout;/m)
  })

  it('os roteiros de rollback das fases anteriores rodam o da F67 ANTES do deles (a ordem inversa entre fases)', () => {
    for (const fase of ['f62', 'f63', 'f64', 'f65']) {
      const sql = readFileSync(join(RAIZ, 'supabase', 'tests', `${fase}_rollback.sql`), 'utf8')
      const inclui = [...sql.matchAll(/^\\ir \.\.\/rollback\/(F\d\d[^\s]*)\.sql$/gm)].map((m) => m[1])
      const f67 = inclui.map((x, i) => (x === 'F67-desfaz' ? i : -1)).filter((i) => i >= 0)
      expect(f67.length, `${fase}_rollback.sql não roda o F67-desfaz`).toBeGreaterThan(0)
      for (const i of f67) expect(inclui[i + 1], `${fase}_rollback.sql: o F67-desfaz não precede o F66B-desfaz`).toBe('F66B-desfaz')
      expect(inclui.filter((x) => x === 'F66B-desfaz').length, fase).toBe(f67.length)
    }
    // o da F66 mede o "antes" das policies dos bancos vivos: o da F67 sai ANTES da medição
    const f66 = readFileSync(join(RAIZ, 'supabase', 'tests', 'f66_rollback.sql'), 'utf8')
    expect(f66.indexOf('\\ir ../rollback/F67-desfaz.sql')).toBeGreaterThan(-1)
    expect(f66.indexOf('\\ir ../rollback/F67-desfaz.sql')).toBeLessThan(f66.indexOf('select pg_temp.f66_contagens() as contagens_antes'))
  })

  it('o ensaio f67_rollback.sql roda o arquivo três vezes (contraído, de novo, só-expansão), reaplica as oito da expansão e emite UMA linha FIM fechando o bloco', () => {
    const sql = readFileSync(join(RAIZ, 'supabase', 'tests', 'f67_rollback.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(sql.match(/^\\ir \.\.\/rollback\/F67-desfaz\.sql$/gm)).toHaveLength(3)
    const expansao = daF67.map((m) => m.arquivo).filter((a) => a < '0193')
    expect(expansao).toHaveLength(8)
    for (const a of expansao) expect(sql).toContain(`\\ir ../migrations/${a}\n`)
    expect(sql).not.toContain('0193_')
    const linhas = sql.split('\n')
    const i = linhas.findIndex((l) => l.includes("raise notice 'FIM f67_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;"))
    expect(i).toBeGreaterThan(-1)
    expect(linhas.filter((l) => l.includes("'FIM f67_rollback:")).length).toBe(1)
    expect((linhas[i + 1] ?? '').trim()).toMatch(/^end(\s*\$\$;)?$/)
    for (const r of ['rb1', 'rb2', 'rb3', 'rb4', 'rb5', 'rb6', 'rb7']) expect(sql).toMatch(new RegExp(String.raw`assert_zero_de\('${r} `))
  })
})
