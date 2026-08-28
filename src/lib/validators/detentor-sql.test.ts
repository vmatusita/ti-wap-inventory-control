import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Constants } from '@/lib/types/database'
import { STATUS_COM_DETENTOR, statusTemDetentor } from '@/lib/dominio'
import type { StatusAtivo } from '@/lib/dominio'

// GUARDA DE SINCRONIA TS↔SQL DE QUEM ESTÁ COM O EQUIPAMENTO (F36).
//
// `STATUS_COM_DETENTOR` (dominio.ts) se declara espelho de `status_tem_detentor`, a
// função de vocabulário criada na migration 0110 — a fonte única do zeramento de
// colaborador/setor em `aplicar_movimentacao`, `rel_estoque_asof` e
// `forcar_estado_ativo`. Sem uma trava, um estado novo (ou um estado que mudasse de
// lado) divergiria em silêncio: o banco apagaria o detentor e a tela continuaria
// prometendo que ele sobrevive ali, ou o contrário.
//
// Este teste deriva a lista DIRETO do SQL da migration vigente e compara com o TS.
// Mesma técnica de `transicoes-sql.test.ts` (item D da dívida) e de
// `marcadores-sql.test.ts` (item H) — a única forma de ligar os dois lados sem um
// banco no processo do Vitest. O comportamento em si é provado por roteiro SQL no job
// `banco` do CI (`supabase/tests/f36_detentor.sql`); aqui a rede é de compilação.

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')
const TODOS_STATUS = Constants.public.Enums.status_ativo as readonly StatusAtivo[]

// Âncora da DEFINIÇÃO, não do nome: `comment on function`, `revoke ... on function` e
// `grant ... on function` também citam a função, e um `lastIndexOf` pelo nome cru cairia
// na última dessas linhas — depois do corpo — e não acharia o `select` nenhum.
const ANCORA_CREATE = 'create or replace function public.status_tem_detentor'

/** A migration VIGENTE da função: a de maior número que a define (`create or replace`). */
function migrationVigenteDoVocabulario(): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) =>
      readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes(ANCORA_CREATE),
    )
    .sort() // prefixo numérico zero-padded ordena lexicograficamente
  const arquivo = arquivos.at(-1)
  if (!arquivo) throw new Error('nenhuma migration define status_tem_detentor')
  return { arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }
}

/**
 * Os literais do `select p in ('a', 'b')` da ÚLTIMA definição da função no arquivo.
 * O corpo é de uma linha só, de propósito (a migration diz isso por escrito).
 */
function estadosComDetentorNoSql(sql: string): string[] {
  const inicioFn = sql.lastIndexOf(ANCORA_CREATE)
  const trecho = sql.slice(inicioFn)
  const linha = trecho.match(/select\s+p\s+in\s*\(([^)]*)\)/)
  if (!linha) throw new Error('não achei o `select p in (…)` da função status_tem_detentor')
  return [...linha[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

describe('STATUS_COM_DETENTOR (TS) espelha status_tem_detentor (SQL da migration vigente)', () => {
  const { sql } = migrationVigenteDoVocabulario()
  const doSql = estadosComDetentorNoSql(sql)

  it('a migration vigente lista pelo menos um estado (guarda do próprio teste)', () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('a lista do TS é exatamente a do SQL', () => {
    expect([...STATUS_COM_DETENTOR].sort()).toEqual([...doSql].sort())
  })

  it('todo estado citado no SQL existe no enum do banco', () => {
    const doBanco = new Set<string>(TODOS_STATUS)
    for (const s of doSql) {
      expect(doBanco.has(s), `${s} não existe no enum status_ativo`).toBe(true)
    }
  })

  it.each(TODOS_STATUS)('estado `%s`: o predicado do TS bate com o SQL', (status) => {
    expect(statusTemDetentor(status)).toBe(doSql.includes(status))
  })

  it('os estados SEM dono são o complemento — nenhum estado fica de fora da regra', () => {
    const semDono = TODOS_STATUS.filter((s) => !statusTemDetentor(s))
    expect(semDono.length + STATUS_COM_DETENTOR.length).toBe(TODOS_STATUS.length)
    // sanidade de domínio: o estoque e as duas baixas terminais nunca têm dono
    expect(semDono).toContain('em_estoque')
    expect(semDono).toContain('descartado')
    expect(semDono).toContain('devolvido_fornecedor')
  })
})
