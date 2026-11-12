import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comandosDoTexto } from '../../../scripts/db/classificar-migration.mjs'
import { LOTES_COMPRIMENTO, TETOS_COLUNA, constraintsDeTamanho, nomeDaConstraintDeTamanho } from './tetos-coluna'

// =============================================================================
// O ROLLBACK DA F66B TIRA EXATAMENTE O QUE A FASE PÔS — a completude, na mesa (12/11/2026)
// =============================================================================
// O ensaio roda no CI (`supabase/tests/f66b_rollback.sql`: as CHECK de public voltam à impressão de antes da 0181, e o
// arquivo rodado de novo não muda nada). O que o ensaio não vê é a COMPLETUDE contra a fonte: um CHECK que a fase pôs e
// o rollback esqueceu, um nome digitado errado (o `if exists` o engoliria em silêncio), uma ordem que não é a inversa.
// Aqui, sem banco, no molde de `rollback-f66.test.ts`: o `F66B-desfaz.sql` é lido pelo léxico único, comando a comando.
// E os ensaios das fases ANTERIORES rodam o da F66B antes do da F66 (fato 18 do PLAN-F66B).
// =============================================================================

const RAIZ = process.cwd()
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8').replace(/\r\n/g, '\n')
const DESFAZ = ler('supabase', 'rollback', 'F66B-desfaz.sql')
const COMANDOS = comandosDoTexto(DESFAZ).map((c) => c.replace(/\s+/g, ' ').trim().toLowerCase())

/** Os `alter table … drop constraint if exists …` do rollback, na ordem do arquivo. */
const drops = COMANDOS.filter((c) => c.startsWith('alter table')).map((c) => {
  const m = /^alter table public\.([a-z_0-9]+) (.*)$/.exec(c)
  if (!m) throw new Error(`alter table fora da forma: ${c}`)
  const nomes = m[2].split(/,\s*/).map((p) => {
    const d = /^drop constraint if exists ([a-z_0-9]+)$/.exec(p.trim())
    if (!d) throw new Error(`subcomando fora da forma (só drop constraint if exists): ${p}`)
    return d[1]
  })
  return { tabela: m[1], nomes }
})

describe('F66B-desfaz.sql — a completude contra a fonte', () => {
  it('só tem set/reset do lock_timeout e alter table … drop constraint if exists (nada de drop column, cascade, update)', () => {
    for (const c of COMANDOS) {
      expect(/^(set lock_timeout = ''|reset lock_timeout|alter table public\.)/.test(c), `comando inesperado: ${c}`).toBe(true)
      expect(c, c).not.toMatch(/\bcascade\b|\bupdate\b|\bdrop (table|column)\b/)
    }
    expect(COMANDOS[0]).toBe("set lock_timeout = ''")
    expect(COMANDOS[COMANDOS.length - 1]).toBe('reset lock_timeout')
  })

  it('tira EXATAMENTE as 65 constraints da fonte, cada uma uma vez, pelo nome', () => {
    const tirados = drops.flatMap((d) => d.nomes).sort()
    expect(tirados).toEqual(constraintsDeTamanho().map((c) => c.nome).sort())
    expect(new Set(tirados).size).toBe(65)
  })

  it('cada constraint sai da tabela dela', () => {
    for (const d of drops) {
      const esperados = Object.keys(TETOS_COLUNA[d.tabela as keyof typeof TETOS_COLUNA]).map((c) => nomeDaConstraintDeTamanho(d.tabela, c))
      expect(d.nomes, d.tabela).toEqual(esperados)
    }
  })

  it('a ordem é a INVERSA do apply: 0184 primeiro, 0181 por último, e as tabelas de cada lote invertidas', () => {
    const esperado = [...LOTES_COMPRIMENTO].reverse().flatMap((l) => [...l.tabelas].reverse())
    expect(drops.map((d) => d.tabela)).toEqual(esperado)
  })

  it('não toca as constraints de comprimento anteriores à F66B', () => {
    expect(DESFAZ.replace(/--[^\n]*/g, '')).not.toMatch(/anotacao_texto_len|unidades_apelidos_apelido_tamanho\b/)
  })
})

describe('os ensaios das fases anteriores rodam o da F66B ANTES do da F66', () => {
  const BS = String.fromCharCode(92)
  it.each(['f62_rollback', 'f63_rollback', 'f64_rollback', 'f65_rollback'])('%s.sql', (nome) => {
    const linhas = ler('supabase', 'tests', `${nome}.sql`).split('\n')
    const f66 = linhas.map((l, i) => (l === `${BS}ir ../rollback/F66-desfaz.sql` ? i : -1)).filter((i) => i >= 0)
    expect(f66.length, `${nome}: não roda o F66-desfaz`).toBeGreaterThan(0)
    for (const i of f66) {
      expect(linhas[i - 1], `${nome}: o F66B-desfaz não vem logo antes do F66-desfaz (linha ${i + 1})`).toBe(`${BS}ir ../rollback/F66B-desfaz.sql`)
    }
  })

  it('f66b_rollback.sql roda o arquivo de verdade, duas vezes (a idempotência)', () => {
    const sql = ler('supabase', 'tests', 'f66b_rollback.sql')
    expect(sql.split(`${BS}ir ../rollback/F66B-desfaz.sql`).length - 1).toBe(2)
  })
})
