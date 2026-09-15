import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fimDoComando } from '../../../scripts/db/corpo-vigente.mjs'
import { COLUNAS_DE_VIEW_NAO_NULAS } from '@/lib/supabase/colunas-de-view'
import type { EntradaDeMapa } from '@/lib/supabase/rpc'

// AS COLUNAS DE VIEW NÃO-NULAS, CONFERIDAS CONTRA A DEFINIÇÃO VIVA DA VIEW (F58 · Frente C).
//
// `COLUNAS_DE_VIEW_NAO_NULAS` autoriza um schema a tirar o `null` de uma coluna de view — o que o
// gerador de tipos nunca faz, porque não lê a definição. A autorização é uma afirmação sobre o
// SQL, e afirmação sobre o SQL que ninguém confere apodrece: uma migration reescreve a view, o join
// interno vira `left join`, e a entrada continua lá deixando o schema recusar o `null` que agora
// existe — a forma errada LANÇA em produção (decisão i do Johnny).
//
// Este teste resolve a definição VIVA de cada view do mapa — o último `create [or replace] view`
// nas migrations, varrendo em ordem (e reprovando se um `drop view` posterior a apagou) — e exige
// que a coluna apareça nela e que a EVIDÊNCIA exista, em texto normalizado (sem comentário, sem
// caixa, espaço colapsado). Disco lido na COLETA.

const PASTA = join(process.cwd(), 'supabase', 'migrations')
const normal = (s: string) => s.replace(/--[^\n]*/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const MIGRATIONS = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((arquivo) => ({ arquivo, sql: readFileSync(join(PASTA, arquivo), 'utf8').replace(/--[^\n]*/g, '') }))

/** A definição viva de uma view, ou `null` se ela não existe (ou foi dropada por último). */
export function definicaoViva(view: string): { arquivo: string; sql: string } | null {
  let viva: { arquivo: string; sql: string } | null = null
  const reCria = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?${view}\b`, 'gi')
  const reDrop = new RegExp(String.raw`drop\s+view\s+(?:if\s+exists\s+)?(?:public\.)?${view}\b`, 'gi')
  for (const m of MIGRATIONS) {
    const eventos: { i: number; tipo: 'cria' | 'drop' }[] = []
    for (const x of m.sql.matchAll(reCria)) eventos.push({ i: x.index ?? 0, tipo: 'cria' })
    for (const x of m.sql.matchAll(reDrop)) eventos.push({ i: x.index ?? 0, tipo: 'drop' })
    for (const e of eventos.sort((a, b) => a.i - b.i)) {
      viva = e.tipo === 'drop' ? null : { arquivo: m.arquivo, sql: normal(m.sql.slice(e.i, fimDoComando(m.sql, e.i))) }
    }
  }
  return viva
}

const ENTRADAS = Object.entries(COLUNAS_DE_VIEW_NAO_NULAS).flatMap(([view, colunas]) =>
  Object.entries(colunas as Record<string, EntradaDeMapa>).map(([coluna, e]) => [view, coluna, e] as const),
)
const DEFINICOES = new Map(Object.keys(COLUNAS_DE_VIEW_NAO_NULAS).map((v) => [v, definicaoViva(v)]))

describe('a resolução da definição viva de view (guarda do próprio teste)', () => {
  it('acha as views do mapa nas migrations em que vivem', () => {
    expect(definicaoViva('v_estoque_atual')?.arquivo).toBe('0006_views.sql')
    expect(definicaoViva('v_conflitos_filiais')?.arquivo).toBe('0134_desempate_por_ordem.sql')
  })
  it('uma view inexistente não resolve', () => {
    expect(definicaoViva('v_que_nao_existe')).toBeNull()
  })
  it('o mapa não está vazio', () => {
    expect(ENTRADAS.length).toBeGreaterThanOrEqual(2)
  })
})

describe('COLUNAS_DE_VIEW_NAO_NULAS — cada coluna tem respaldo na definição viva', () => {
  it.each(ENTRADAS)('%s.%s', (view, coluna, entrada) => {
    const def = DEFINICOES.get(view)
    expect(def, `a view ${view} não existe viva nas migrations`).not.toBeNull()
    expect(def!.sql, `${view}: a coluna ${coluna} não aparece na definição viva (${def!.arquivo})`).toMatch(
      new RegExp(String.raw`\b${coluna}\b`),
    )
    expect(
      def!.sql.includes(normal(entrada.evidencia)),
      `${view}.${coluna}: a evidência não existe na definição viva (${def!.arquivo})`,
    ).toBe(true)
    expect(entrada.motivo.length, `${view}.${coluna}: motivo curto demais`).toBeGreaterThan(20)
  })
})
