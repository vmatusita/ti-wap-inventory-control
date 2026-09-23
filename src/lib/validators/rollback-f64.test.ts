import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { funcoesVigentes, lerMigrations } from '../../../scripts/db/cargo-congelado.mjs'

// =============================================================================
// O ROLLBACK DA F64 DEVOLVE O BANCO DE ANTES DA 0162 — a completude, na mesa (23/09/2026)
// =============================================================================
// O ensaio do rollback roda no CI (`supabase/tests/f64_rollback.sql`: a impressão do esquema das
// onze e das duas funções volta à de antes da 0162). O que o ensaio não vê é a COMPLETUDE contra as
// migrations — uma função que a F64 criou e o rollback esqueceu de derrubar, ou uma que ela recriou
// e o rollback reemitiu com outro corpo. Aqui, sem banco, no molde do describe 9 de
// `cargo-em-membros.test.ts` (o da F62): o `F64-desfaz.sql` derruba TODA função que a F64 criou,
// reemite TODA função que ela recriou com o corpo vigente ANTES da 0162 BYTE A BYTE, derruba o
// gatilho, e tira `empresa_id` das onze de `k_lote2` (a fonte única, catalogo_policies.sql).
// =============================================================================

const RAIZ = process.cwd()
const MIGRATIONS = lerMigrations(RAIZ)
const DESFAZ = readFileSync(join(RAIZ, 'supabase', 'rollback', 'F64-desfaz.sql'), 'utf8').replace(/\r\n/g, '\n')
const CATALOGO = readFileSync(join(RAIZ, 'supabase', 'tests', 'catalogo_policies.sql'), 'utf8')
const PRIMEIRA_DA_F64 = '0162'
const PRIMEIRA_DEPOIS_DA_F64 = '0165'

const ANTES = funcoesVigentes(MIGRATIONS, PRIMEIRA_DA_F64)
const DEPOIS = funcoesVigentes(MIGRATIONS, PRIMEIRA_DEPOIS_DA_F64)
const DA_F64 = [...DEPOIS].filter(([, f]) => f.arquivo.slice(0, 4) >= PRIMEIRA_DA_F64)
const recriadas = DA_F64.filter(([k]) => ANTES.has(k)).map(([k]) => k).sort()
const criadas = DA_F64.filter(([k]) => !ANTES.has(k)).map(([k]) => k).sort()

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

describe('o rollback da F64 (supabase/rollback/F64-desfaz.sql) é COMPLETO contra as migrations', () => {
  it('a F64 criou a função do gatilho do kit e recriou o núcleo da integridade (guarda do próprio teste)', () => {
    expect(criadas).toEqual(['kit_motivo_da_empresa/0'])
    expect(recriadas).toEqual(['checagens_integridade_nucleo/0'])
  })

  it.each(criadas)('%s é derrubada', (chave) => {
    expect(DESFAZ).toMatch(new RegExp(String.raw`^drop function if exists public\.${chave.split('/')[0]}\(\);`, 'm'))
  })

  it.each(recriadas)('%s volta com o corpo vigente ANTES da 0162, byte a byte', (chave) => {
    const nome = chave.split('/')[0]
    const antes = ANTES.get(chave as `${string}/${number}`)!
    const original = corpo(antes.texto.replace(/\r\n/g, '\n'), nome)
    expect(original, `não achei o corpo de ${nome} em ${antes.arquivo}`).not.toBeNull()
    expect(corpo(DESFAZ, nome), `${nome} não volta byte a byte no rollback`).toBe(original)
  })

  it('o gatilho do kit sai ANTES da função dele (a ordem inversa do apply)', () => {
    const gatilho = DESFAZ.search(/^drop trigger if exists kits_modelos_motivo_da_empresa on public\.kits_modelos;/m)
    const funcao = DESFAZ.search(/^drop function if exists public\.kit_motivo_da_empresa\(\);/m)
    expect(gatilho).toBeGreaterThan(-1)
    expect(funcao).toBeGreaterThan(gatilho)
  })

  it('tira empresa_id das onze de k_lote2 — e o passo 1 (a 0164) vem antes dos das colunas', () => {
    const m = /k_lote2 text\[\] := array\[([\s\S]*?)\];/.exec(CATALOGO)
    expect(m, 'não achei k_lote2 em catalogo_policies.sql').not.toBeNull()
    const onze = [...m![1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])
    expect(onze).toHaveLength(11)
    const primeiraColuna = DESFAZ.search(/^alter table public\.[a-z_]+\s+drop column if exists empresa_id;/m)
    expect(primeiraColuna).toBeGreaterThan(DESFAZ.search(/^drop function if exists public\.kit_motivo_da_empresa/m))
    for (const t of onze) {
      expect(DESFAZ, t).toMatch(new RegExp(String.raw`^alter table public\.${t}\s+drop column if exists empresa_id;`, 'm'))
    }
  })

  it('sem begin/commit próprios (quem roda decide a transação) e com lock_timeout por set/reset', () => {
    const codigo = DESFAZ.replace(/--[^\n]*/g, '')
    expect(codigo).not.toMatch(/^\s*(begin|commit)\s*;/im)
    expect(codigo).toMatch(/^set lock_timeout = '2s';/m)
    expect(codigo).toMatch(/^reset lock_timeout;/m)
  })
})
