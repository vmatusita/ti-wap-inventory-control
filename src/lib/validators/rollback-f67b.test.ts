import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { funcoesVigentes, lerMigrations } from '../../../scripts/db/cargo-congelado.mjs'
import { semComentarios, textoExecutadoMascarado } from '../../../scripts/db/classificar-migration.mjs'
import { replayPolicies } from '../../../scripts/db/predicado-policies.mjs'

// =============================================================================
// O ROLLBACK DA F67B DEVOLVE O ESQUEMA DE ANTES DA 0194 — a completude, na mesa (16/11/2026)
// =============================================================================
// O ensaio do rollback roda no CI (`supabase/tests/f67b_rollback.sql`: a impressão das funções — com a ACL de cada papel —,
// das policies, das views, dos gatilhos e dos comentários volta à da cadeia até a 0193, nos dois estados de produção; o
// arquivo rodado de novo não muda nada; nenhum objeto de Storage é tocado). O que o ensaio não vê é a COMPLETUDE contra as
// migrations: uma função que a F67B recriou e o rollback esqueceu, uma nova que ficou de pé, uma policy devolvida com a
// cláusula trocada. Aqui, sem banco, no molde de `rollback-f67.test.ts`: cada corpo volta BYTE A BYTE ao vigente antes da
// 0194, cada função nova sai, as dez policies voltam ao texto do replay da trava de mesa.
// =============================================================================

const RAIZ = process.cwd()
const MIGRATIONS = lerMigrations(RAIZ) as { arquivo: string; sql: string }[]
const DESFAZ = readFileSync(join(RAIZ, 'supabase', 'rollback', 'F67B-desfaz.sql'), 'utf8').replace(/\r\n/g, '\n')
const CODIGO = semComentarios(DESFAZ) as string
const PRIMEIRA = '0194'
const DEPOIS_DA_ULTIMA = '0200'

const ANTES = funcoesVigentes(MIGRATIONS, PRIMEIRA)
const daF67B = MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) >= PRIMEIRA && m.arquivo.slice(0, 4) < DEPOIS_DA_ULTIMA)
const antesDaF67B = MIGRATIONS.filter((m) => m.arquivo.slice(0, 4) < PRIMEIRA)
const temContracao = daF67B.some((m) => m.arquivo.startsWith('0199'))

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

const criadasOuRecriadas = [...new Set(daF67B.flatMap((m) => definidas(m.sql)))]
const recriadasNoLugar = criadasOuRecriadas.filter((k) => ANTES.has(k as `${string}/${number}`)).sort()
const novas = criadasOuRecriadas.filter((k) => !ANTES.has(k as `${string}/${number}`)).sort()
const contracao = daF67B.filter((m) => m.arquivo >= '0198').flatMap((m) => derrubadas(m.sql)).sort()
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

/** As policies que as migrations da F67B reescrevem (`alter policy "x" on esquema.tabela`), com as cláusulas que tocam. */
function reescritas(): Map<string, { using: boolean; withCheck: boolean }> {
  const out = new Map<string, { using: boolean; withCheck: boolean }>()
  for (const m of daF67B) {
    for (const x of m.sql.replace(/\r\n/g, '\n').matchAll(/^alter policy "([^"]+)" on (\w+)\.(\w+)\n([\s\S]*?);\n/gm)) {
      const k = `${x[2]}.${x[3]} / ${x[1]}`
      const antes = out.get(k) ?? { using: false, withCheck: false }
      out.set(k, { using: antes.using || /^\s*using\b/m.test(x[4]), withCheck: antes.withCheck || /with check/.test(x[4]) })
    }
  }
  return out
}

describe('o rollback da F67B (supabase/rollback/F67B-desfaz.sql) é COMPLETO contra as migrations', () => {
  it('o universo (guarda do próprio teste): 7 recriadas no lugar, 4 derrubadas pela contração, 7 novas — 11 devolvidas', () => {
    expect(temContracao, 'a contração (0198/0199) não está no disco').toBe(true)
    expect(recriadasNoLugar).toEqual([
      'apagar_ativos_conflito_filiais/5',
      'checagens_integridade_nucleo/0',
      'import_validar_plano/4',
      'pode_escrever_arquivo_termo/1',
      'pode_ler_arquivo_termo/1',
      'resetar_acervo/6',
      'resetar_itens/6',
    ])
    expect(contracao).toEqual(['pode_escrever_termo/1', 'prefixo_backup_conflito/0', 'prefixo_backup_import/1', 'prefixo_backup_reset/2'])
    expect(novas).toEqual([
      'caminho_backup_legado/1',
      'empresa_do_caminho_backup/1',
      'pode_escrever_termo/2',
      'prefixo_backup_conflito/1',
      'prefixo_backup_import/2',
      'prefixo_backup_reset/3',
      'registrar_limpeza_termos_sem_linha/3',
    ])
    expect(devolvidas).toHaveLength(11)
  })

  it.each(devolvidas)('%s volta com o corpo vigente ANTES da 0194, byte a byte', (chave) => {
    const antes = ANTES.get(chave as `${string}/${number}`)
    expect(antes, `${chave} não existia antes da 0194`).toBeDefined()
    const original = corpo(antes!.texto.replace(/\r\n/g, '\n'), chave)
    expect(original, `não achei o corpo de ${chave} em ${antes!.arquivo}`).not.toBeNull()
    expect(corpo(DESFAZ, chave), `${chave} não volta byte a byte no rollback`).toBe(original)
  })

  it('o rollback recria EXATAMENTE as devolvidas (nenhuma a mais), sempre com create or replace', () => {
    expect([...new Set(definidas(DESFAZ))].sort()).toEqual(devolvidas)
    expect(CODIGO).not.toMatch(/create\s+function\b/i)
  })

  it('toda função NOVA da F67B sai com drop … if exists (e nenhuma antiga sai)', () => {
    expect([...new Set(derrubadas(DESFAZ))].sort()).toEqual(novas)
    expect(CODIGO).not.toMatch(/drop\s+function\s+(?!if\s+exists)/i)
  })

  it('as que a contração derrubou voltam com a ACL de antes (revoke de todos; o EXECUTE só de quem tinha)', () => {
    for (const assin of ['prefixo_backup_import(smallint)', 'prefixo_backup_reset(text, smallint)', 'prefixo_backup_conflito()']) {
      expect(CODIGO).toContain(`revoke all on function public.${assin} from public, anon, authenticated, service_role;`)
      expect(CODIGO).not.toContain(`grant execute on function public.${assin}`)
    }
    expect(CODIGO).toContain('revoke all on function public.pode_escrever_termo(uuid[]) from public, anon, authenticated, service_role;')
    expect(CODIGO).toContain('grant execute on function public.pode_escrever_termo(uuid[]) to authenticated;')
  })

  it('as dez policies que a F67B reescreveu voltam ao texto de antes da 0194 (o replay da trava de mesa), cláusula a cláusula', () => {
    const mexidas = reescritas()
    expect(mexidas.size).toBe(10)
    const doDesfaz = new Map<string, { using: string | null; withCheck: string | null }>()
    for (const x of DESFAZ.matchAll(/^alter policy "([^"]+)" on (\w+)\.(\w+)((?:\n {2}(?:using|with check) [\s\S]*?)+);\n/gm)) {
      const u = /\n {2}using \(([\s\S]*?)\)(?=\n {2}with check|$)/.exec(x[4])
      const w = /\n {2}with check \(([\s\S]*)\)$/.exec(x[4])
      doDesfaz.set(`${x[2]}.${x[3]} / ${x[1]}`, { using: u ? u[1] : null, withCheck: w ? w[1] : null })
    }
    expect([...doDesfaz.keys()].sort()).toEqual([...mexidas.keys()].sort())
    const antes = replayPolicies(antesDaF67B)
    expect(antes.falhas).toEqual([])
    for (const [chave, c] of mexidas) {
      const a = antes.vivas.get(chave)
      const d = doDesfaz.get(chave)!
      expect(a, `${chave} não existia antes da 0194`).toBeDefined()
      expect(d.using !== null, `${chave}: using`).toBe(c.using)
      expect(d.withCheck !== null, `${chave}: with check`).toBe(c.withCheck)
      expect(norm(d.using), `${chave} (using)`).toBe(norm(a.using))
      expect(norm(d.withCheck), `${chave} (with check)`).toBe(norm(a.withCheck))
    }
  })

  it('o comment de eventos_admin.acao volta ao último de antes da 0194, byte a byte', () => {
    const marca = 'comment on column public.eventos_admin.acao is'
    const ultimo = antesDaF67B.filter((m) => m.sql.includes(marca)).at(-1)!
    const doAntes = ultimo.sql.replace(/\r\n/g, '\n')
    const trecho = (t: string) => {
      const i = t.lastIndexOf(marca)
      return t.slice(i, t.indexOf("';\n", i) + 2)
    }
    expect(trecho(DESFAZ)).toBe(trecho(doAntes))
    expect(trecho(DESFAZ)).not.toContain('termos_sem_linha_limpos')
  })

  it('os passos saem na ORDEM INVERSA do apply (0199 primeiro, 0194 por último)', () => {
    const passos = [...DESFAZ.matchAll(/^-- (01\d\d) (?:\((?:a contração|a expansão)\) )?—/gm)].map((m) => m[1])
    expect(passos).toEqual(['0199', '0198', '0197', '0196', '0195', '0194'])
  })

  it('só catálogo: nada de update/delete/insert/truncate/cascade/begin/commit; lock_timeout por set/reset', () => {
    const executado = textoExecutadoMascarado(DESFAZ) as string
    expect(executado).not.toMatch(/\b(update|delete|insert|truncate|cascade|commit|rollback)\b/i)
    expect(CODIGO).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im)
    expect(CODIGO).not.toMatch(/storage\.objects\s+(?:set|where)|from\s+storage\.objects\s+where/i)
    expect(CODIGO).toMatch(/^set lock_timeout = '2s';/m)
    expect(CODIGO).toMatch(/^reset lock_timeout;/m)
  })

  it('os roteiros de rollback das fases anteriores rodam o da F67B IMEDIATAMENTE antes do da F67 (na cadeia inteira)', () => {
    for (const fase of ['f62', 'f63', 'f64', 'f65', 'f66']) {
      const sql = readFileSync(join(RAIZ, 'supabase', 'tests', `${fase}_rollback.sql`), 'utf8')
      const inclui = [...sql.matchAll(/^\\ir \.\.\/rollback\/(F\d\d[^\s]*)\.sql$/gm)].map((m) => m[1])
      const f67 = inclui.map((x, i) => (x === 'F67-desfaz' ? i : -1)).filter((i) => i >= 0)
      expect(f67.length, `${fase}_rollback.sql não roda o F67-desfaz`).toBeGreaterThan(0)
      for (const i of f67) expect(inclui[i - 1], `${fase}_rollback.sql: o F67B-desfaz não precede o F67-desfaz`).toBe('F67B-desfaz')
      expect(inclui.filter((x) => x === 'F67B-desfaz').length, fase).toBe(f67.length)
    }
    // o da F67: SÓ antes do primeiro (o contraído); o 2º (rb5) e o do só-expansão da F67 rodam sem a F67B
    const f67 = readFileSync(join(RAIZ, 'supabase', 'tests', 'f67_rollback.sql'), 'utf8').replace(/\r\n/g, '\n')
    const inclui = [...f67.matchAll(/^\\ir \.\.\/rollback\/(F\d\d[^\s]*)\.sql$/gm)].map((m) => m[1])
    expect(inclui).toEqual(['F67B-desfaz', 'F67-desfaz', 'F67-desfaz', 'F67-desfaz'])
  })

  it('o ensaio f67b_rollback.sql roda o arquivo três vezes (contraído, de novo, só-expansão), reaplica as quatro da expansão e emite UMA linha FIM', () => {
    const sql = readFileSync(join(RAIZ, 'supabase', 'tests', 'f67b_rollback.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(sql.match(/^\\ir \.\.\/rollback\/F67B-desfaz\.sql$/gm)).toHaveLength(3)
    const expansao = daF67B.map((m) => m.arquivo).filter((a) => a < '0198')
    expect(expansao).toHaveLength(4)
    for (const a of expansao) expect(sql).toContain(`\\ir ../migrations/${a}\n`)
    expect(sql).not.toMatch(/\\ir \.\.\/migrations\/019[89]_/)
    const linhas = sql.split('\n')
    const i = linhas.findIndex((l) => l.includes("raise notice 'FIM f67b_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;"))
    expect(i).toBeGreaterThan(-1)
    expect(linhas.filter((l) => l.includes("'FIM f67b_rollback:")).length).toBe(1)
    expect((linhas[i + 1] ?? '').trim()).toMatch(/^end(\s*\$\$;)?$/)
    for (const r of ['rb6', 'rb7', 'rb8', 'rb9']) expect(sql).toMatch(new RegExp(String.raw`assert_zero_de\('${r} `))
    for (const r of ['rb1', 'rb2', 'rb3', 'rb4', 'rb5']) expect(sql).toMatch(new RegExp(String.raw`'${r} `))
  })
})
