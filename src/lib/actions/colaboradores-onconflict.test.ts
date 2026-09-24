import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// F65 · decisão 5 (sabotagem J, a metade de mesa) — o `onConflict` de `consolidarColaboradores` casa
// EXATAMENTE com um unique de `colaboradores` do esquema que as migrations produzem, e NÃO com o global.
//
// O `ON CONFLICT (cols)` do Postgres só infere um árbitro cujas colunas são EXATAMENTE `cols` (senão
// 42P10, e a consolidação cai na cara do operador). O esquema-alvo é reconstruído aqui LENDO AS
// MIGRATIONS DO DISCO, em ordem, só para `public.colaboradores`: `create unique index`, `drop index` e
// `alter index … rename` — as três formas que a casa usa para os uniques desta tabela (0112, 0172, 0174).
// A metade de banco (o 42P10 de verdade, e o intermediário que aceita os dois alvos) mora em
// `supabase/tests/integridade_tenant.sql` (J1–J2).

const PASTA = join(process.cwd(), 'supabase', 'migrations')
const ARQUIVOS = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()

const semComentario = (sql: string) => sql.replace(/--[^\n]*/g, '').toLowerCase().replace(/\s+/g, ' ')

type Unicos = Map<string, string[]>

/** Os uniques de `public.colaboradores` depois de aplicar as migrations até `ate` (inclusive). */
function unicosDeColaboradores(ate?: string): Unicos {
  const unicos: Unicos = new Map([['colaboradores_pkey', ['id']]])
  for (const arquivo of ARQUIVOS) {
    if (ate && arquivo > ate) break
    const sql = semComentario(readFileSync(join(PASTA, arquivo), 'utf8'))
    for (const comando of sql.split(';').map((c) => c.trim())) {
      const criado = comando.match(/^create unique index (\w+) on public\.colaboradores \(([^)]*)\)$/)
      if (criado) {
        unicos.set(criado[1], criado[2].split(',').map((c) => c.trim()))
        continue
      }
      const apagado = comando.match(/^drop index (?:if exists )?public\.(\w+)$/)
      if (apagado) {
        unicos.delete(apagado[1])
        continue
      }
      const renomeado = comando.match(/^alter index public\.(\w+) rename to (\w+)$/)
      if (renomeado && unicos.has(renomeado[1])) {
        unicos.set(renomeado[2], unicos.get(renomeado[1]) ?? [])
        unicos.delete(renomeado[1])
      }
    }
  }
  return unicos
}

const FONTE = readFileSync(join(process.cwd(), 'src', 'lib', 'actions', 'colaboradores.ts'), 'utf8')
const ALVOS = [...FONTE.matchAll(/onConflict:\s*'([^']+)'/g)].map((m) =>
  m[1].split(',').map((c) => c.trim()),
)

const mesmoConjunto = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')

describe('o onConflict dos colaboradores casa com um unique do esquema-alvo (F65, decisão 5)', () => {
  const alvo = unicosDeColaboradores()

  it('há exatamente um onConflict em colaboradores.ts (o de consolidarColaboradores)', () => {
    expect(ALVOS).toHaveLength(1)
  })

  it('cada onConflict tem um árbitro com EXATAMENTE as mesmas colunas no esquema-alvo', () => {
    for (const cols of ALVOS) {
      const arbitro = [...alvo.entries()].find(([, c]) => mesmoConjunto(c, cols))
      expect(arbitro, `ON CONFLICT (${cols.join(', ')}) sem árbitro → 42P10`).toBeDefined()
    }
  })

  it('o árbitro é o unique POR EMPRESA com o nome contratual — o global morreu na 0174', () => {
    expect(alvo.get('colaboradores_nome_chave_uidx')).toEqual(['empresa_id', 'nome_chave'])
    expect([...alvo.values()].some((c) => mesmoConjunto(c, ['nome_chave']))).toBe(false)
    for (const cols of ALVOS) expect(cols).toContain('empresa_id')
  })

  it('no intermediário (0172 aplicada, 0174 não) os DOIS alvos inferem — o app velho e o novo', () => {
    const meio = unicosDeColaboradores('0173_guarda_empresa.sql')
    expect([...meio.values()].some((c) => mesmoConjunto(c, ['nome_chave']))).toBe(true)
    expect([...meio.values()].some((c) => mesmoConjunto(c, ['empresa_id', 'nome_chave']))).toBe(true)
  })
})
