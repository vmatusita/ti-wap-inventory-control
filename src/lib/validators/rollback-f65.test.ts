import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { funcoesVigentes, lerMigrations } from '../../../scripts/db/cargo-congelado.mjs'

// =============================================================================
// O ROLLBACK DA F65 DEVOLVE O BANCO DE ANTES DA 0165 — a completude, na mesa (23/09/2026)
// =============================================================================
// O ensaio do rollback roda no CI (`supabase/tests/f65_rollback.sql`: a impressão do catálogo volta à de antes da
// 0165, de CADA estado intermediário). O que o ensaio não vê é a COMPLETUDE contra as migrations — um gatilho que a
// F65 criou e o rollback esqueceu, uma FK composta que ele não devolve à forma simples, uma ação (`deferrable`) que se
// perde. Aqui, sem banco, no molde de `rollback-f64.test.ts`: o `F65-desfaz.sql` derruba TODA função e TODO gatilho que
// a F65 criou, reemite a que ela recriou com o corpo vigente ANTES da 0165 BYTE A BYTE, devolve cada FK composta à
// simples com as MESMAS ações, e desfaz cada constraint e índice novo — pelo nome, lido das migrations.
// =============================================================================

const RAIZ = process.cwd()
const MIGRATIONS = lerMigrations(RAIZ)
const DESFAZ = readFileSync(join(RAIZ, 'supabase', 'rollback', 'F65-desfaz.sql'), 'utf8').replace(/\r\n/g, '\n')
const PRIMEIRA_DA_F65 = '0165'
const PRIMEIRA_DEPOIS_DA_F65 = '0175'

const ANTES = funcoesVigentes(MIGRATIONS, PRIMEIRA_DA_F65)
const DEPOIS = funcoesVigentes(MIGRATIONS, PRIMEIRA_DEPOIS_DA_F65)
const DA_F65 = [...DEPOIS].filter(([, f]) => f.arquivo.slice(0, 4) >= PRIMEIRA_DA_F65)
const recriadas = DA_F65.filter(([k]) => ANTES.has(k)).map(([k]) => k).sort()
const criadas = DA_F65.filter(([k]) => !ANTES.has(k)).map(([k]) => k).sort()

/** O SQL das dez migrations da F65, sem comentário de linha. */
const SQL_F65 = (MIGRATIONS as { arquivo: string; sql: string }[])
  .filter((m) => m.arquivo.slice(0, 4) >= PRIMEIRA_DA_F65 && m.arquivo.slice(0, 4) < PRIMEIRA_DEPOIS_DA_F65)
  .map((m) => m.sql.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, ''))
  .join('\n')
const CODIGO_DESFAZ = DESFAZ.replace(/--[^\n]*/g, '')

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

type Fk = { nome: string; colunas: string[]; pai: string; acoes: string }
/** Cada `add constraint X foreign key (…) references public.P (…) <ações>` de um texto SQL. */
function fks(sql: string): Map<string, Fk> {
  const saida = new Map<string, Fk>()
  const re = /add constraint (\w+)\s+foreign key \(([^)]*)\)\s+references public\.(\w+) \([^)]*\)([^,;]*)/g
  for (const m of sql.matchAll(re)) {
    saida.set(m[1], {
      nome: m[1],
      colunas: m[2].split(',').map((c) => c.trim()),
      pai: m[3],
      acoes: m[4].replace(/\s+/g, ' ').trim(),
    })
  }
  return saida
}

describe('o rollback da F65 (supabase/rollback/F65-desfaz.sql) é COMPLETO contra as migrations', () => {
  it('a F65 criou a guarda e a do termo, e recriou a diagonal (guarda do próprio teste)', () => {
    expect(criadas).toEqual(['guarda_empresa/0', 'termo_da_empresa/0'])
    expect(recriadas).toEqual(['vocabulario_unidades_guarda/0'])
  })

  it.each(criadas)('%s é derrubada', (chave) => {
    expect(DESFAZ).toMatch(new RegExp(String.raw`^drop function if exists public\.${chave.split('/')[0]}\(\);`, 'm'))
  })

  it.each(recriadas)('%s volta com o corpo vigente ANTES da 0165, byte a byte', (chave) => {
    const nome = chave.split('/')[0]
    const antes = ANTES.get(chave as `${string}/${number}`)!
    const original = corpo(antes.texto.replace(/\r\n/g, '\n'), nome)
    expect(original, `não achei o corpo de ${nome} em ${antes.arquivo}`).not.toBeNull()
    expect(corpo(DESFAZ, nome), `${nome} não volta byte a byte no rollback`).toBe(original)
  })

  const gatilhos = [...SQL_F65.matchAll(/create trigger (\w+)[\s\S]*?\bon public\.(\w+)[\s\S]*?execute function public\.(\w+)\(\)/g)].map(
    (m) => ({ nome: m[1], tabela: m[2], funcao: m[3] }),
  )

  it('a F65 criou 41 gatilhos: os 40 da guarda (o de coluna e o último, nas 20) e o do termo (guarda do próprio teste)', () => {
    expect(gatilhos.filter((g) => g.funcao === 'guarda_empresa')).toHaveLength(40)
    expect(gatilhos.filter((g) => g.nome === 'zz_guarda_empresa')).toHaveLength(20)
    expect(gatilhos.filter((g) => g.funcao === 'termo_da_empresa').map((g) => g.nome)).toEqual(['termos_gerados_ids_da_empresa'])
    expect(gatilhos).toHaveLength(41)
  })

  it.each(gatilhos.map((g) => [g.nome, g.tabela, g.funcao] as const))('o gatilho %s (em %s) sai ANTES da função %s', (nome, tabela, funcao) => {
    const gatilho = DESFAZ.search(new RegExp(String.raw`^drop trigger if exists ${nome} on public\.${tabela};`, 'm'))
    const fn = DESFAZ.search(new RegExp(String.raw`^drop function if exists public\.${funcao}\(\);`, 'm'))
    expect(gatilho, `${nome} não é derrubado`).toBeGreaterThan(-1)
    expect(fn).toBeGreaterThan(gatilho)
  })

  const compostas = fks(SQL_F65)
  const simples = fks(CODIGO_DESFAZ)

  it('a F65 tornou 23 FKs compostas, todas começando por empresa_id (guarda do próprio teste)', () => {
    expect(compostas.size).toBe(23)
    for (const f of compostas.values()) expect(f.colunas[0], f.nome).toBe('empresa_id')
  })

  it.each([...compostas.keys()])('%s volta SIMPLES, ao mesmo pai, com as MESMAS ações', (nome) => {
    const c = compostas.get(nome)!
    const s = simples.get(nome)
    expect(s, `${nome} não volta no rollback`).toBeDefined()
    expect(s!.colunas).toEqual(c.colunas.slice(1))
    expect(s!.pai).toBe(c.pai)
    expect(s!.acoes, `${nome}: as ações divergem (${c.acoes} → ${s!.acoes})`).toBe(c.acoes)
  })

  it('cada unique (empresa_id, id) dos pais sai, e cada índice provisório (_f65) é tratado pelo nome', () => {
    const pais = [...SQL_F65.matchAll(/add constraint (\w+_empresa_id_uidx) unique \(empresa_id, id\)/g)].map((m) => m[1])
    expect(pais).toHaveLength(7)
    for (const p of pais) expect(DESFAZ, p).toMatch(new RegExp(String.raw`drop constraint if exists ${p};`))
    const provisorios = new Set([...SQL_F65.matchAll(/\b(\w+_f65)\b/g)].map((m) => m[1]))
    expect(provisorios.size).toBeGreaterThan(5)
    for (const p of provisorios) {
      const contratual = p.replace(/_f65$/, '')
      expect(CODIGO_DESFAZ.includes(contratual), `${contratual} (recriado pela F65) não é tratado no rollback`).toBe(true)
    }
  })

  it('cada comment on da F65 sobre objeto que já existia tem o seu de volta no rollback (o da função criada sai com ela)', () => {
    const criadasNomes = criadas.map((c) => `public.${c.split('/')[0]}()`)
    const alvos = [...SQL_F65.matchAll(/comment on (index|function) (public\.\w+(?:\(\))?) is/g)]
      .filter((m) => !criadasNomes.includes(m[2]))
      .map((m) => `${m[1]} ${m[2]}`)
    expect(alvos.length).toBeGreaterThan(0)
    for (const a of new Set(alvos)) expect(CODIGO_DESFAZ.includes(`comment on ${a} is`), a).toBe(true)
  })

  it('sem begin/commit próprios (quem roda decide a transação) e com lock_timeout por set/reset', () => {
    expect(CODIGO_DESFAZ).not.toMatch(/^\s*(begin|commit)\s*;/im)
    expect(CODIGO_DESFAZ).toMatch(/^set lock_timeout = '2s';/m)
    expect(CODIGO_DESFAZ).toMatch(/^reset lock_timeout;/m)
  })

  it('os passos saem na ORDEM INVERSA do apply (0174 primeiro, 0165 por último)', () => {
    const passos = [...DESFAZ.matchAll(/^-- (\d)\. \((01\d\d)/gm)].map((m) => m[2])
    expect(passos).toEqual(['0174', '0173', '0172', '0171', '0170', '0169', '0168', '0167', '0165'])
  })
})
