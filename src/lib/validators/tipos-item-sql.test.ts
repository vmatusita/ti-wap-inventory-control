import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACESSORIOS_DEVOLUCAO,
  ACESSORIO_ROTULO,
  rotuloAcessorio,
} from '@/lib/dominio'

// GUARDA DE SINCRONIA TS↔SQL DO VOCABULÁRIO DE TIPOS DE ITEM (F37 · D7).
//
// `ACESSORIOS_DEVOLUCAO` + `ACESSORIO_ROTULO` (dominio.ts) e o seed de `tipos_item`
// (migration 0114) são o MESMO conjunto — e precisam continuar sendo, porque
// `movimentacoes.itens_faltantes` e `pendencias_item.item` guardam esses literais no
// histórico, sem FK e sem CHECK que os obrigue a nada. Hoje o vocabulário mora nos
// dois lugares; é esta guarda que permite à F39 tirar a constante do código sem
// quebrar uma linha de histórico: enquanto os dois lados forem provadamente iguais, a
// remoção é uma troca de fonte, não uma mudança de significado.
//
// Sem ela, o modo de falhar seria silencioso e feio: um tipo criado só no banco
// apareceria no admin e sumiria do checklist da devolução; um slug renomeado só no TS
// faria a pendência antiga exibir o código cru ("fone") no lugar do rótulo.
//
// Mesma técnica de `detentor-sql.test.ts` (F36), `transicoes-sql.test.ts` e
// `chave-sql.test.ts`: deriva o vocabulário DIRETO do SQL da migration vigente.

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')
const ANCORA_SEED = 'insert into public.tipos_item (slug, rotulo, ordem) values'

/** A migration VIGENTE do seed: a de maior número que o escreve. */
function migrationVigenteDoSeed(): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) =>
      readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes(ANCORA_SEED),
    )
    .sort()
  const arquivo = arquivos.at(-1)
  if (!arquivo) throw new Error('nenhuma migration semeia tipos_item')
  return { arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }
}

type LinhaSeed = { slug: string; rotulo: string; ordem: number }

/** As tuplas `('slug', 'Rótulo', N)` do seed, na ordem em que estão no arquivo. */
function seedNoSql(sql: string): LinhaSeed[] {
  const inicio = sql.lastIndexOf(ANCORA_SEED)
  const trecho = sql.slice(inicio + ANCORA_SEED.length)
  // Para no `;` que fecha o INSERT — sem isso, um comentário de smoke mais abaixo
  // com tuplas de exemplo entraria na lista.
  const corpo = trecho.slice(0, trecho.indexOf(';'))
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*\)/g)].map(
    (m) => ({ slug: m[1], rotulo: m[2], ordem: Number(m[3]) }),
  )
}

describe('tipos_item (SQL da migration vigente) espelha o vocabulário do TS', () => {
  const { arquivo, sql } = migrationVigenteDoSeed()
  const doSql = seedNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos um tipo (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('os slugs do SQL são exatamente os do TS', () => {
    expect(doSql.map((l) => l.slug).sort()).toEqual([...ACESSORIOS_DEVOLUCAO].sort())
  })

  it('a ORDEM do seed é a ordem da constante — o checklist e o admin listam igual', () => {
    expect(doSql.map((l) => l.slug)).toEqual([...ACESSORIOS_DEVOLUCAO])
  })

  it.each(ACESSORIOS_DEVOLUCAO)('o rótulo de `%s` é o mesmo nos dois lados', (slug) => {
    const linha = doSql.find((l) => l.slug === slug)
    expect(linha, `${slug} não está no seed da ${arquivo}`).toBeDefined()
    expect(linha?.rotulo).toBe(ACESSORIO_ROTULO[slug])
    expect(linha?.rotulo).toBe(rotuloAcessorio(slug))
  })

  it('`fone` exibe "Fone de ouvido" nos dois lados (a única troca de rótulo da F37)', () => {
    expect(rotuloAcessorio('fone')).toBe('Fone de ouvido')
    expect(doSql.find((l) => l.slug === 'fone')?.rotulo).toBe('Fone de ouvido')
  })

  it('nenhum slug do seed é maiúsculo ou acentuado (o CHECK do banco recusaria)', () => {
    for (const l of doSql) expect(l.slug).toMatch(/^[a-z][a-z0-9_]{1,29}$/)
  })

  it('as ordens são distintas e crescentes — a lista tem um só jeito de sair', () => {
    const ordens = doSql.map((l) => l.ordem)
    expect(new Set(ordens).size).toBe(ordens.length)
    expect([...ordens].sort((a, b) => a - b)).toEqual(ordens)
  })

  it('nenhum rótulo do SQL vem vazio ou só com espaço', () => {
    for (const l of doSql) expect(l.rotulo.trim().length).toBeGreaterThan(0)
  })
})
