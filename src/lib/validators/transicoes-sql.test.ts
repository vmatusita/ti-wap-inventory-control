import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Constants } from '@/lib/types/database'
import { TRANSICOES } from '@/lib/validators/movimentacao'
import type { StatusAtivo, TipoMovimentacao } from '@/lib/dominio'

// GUARDA DE SINCRONIA TS↔SQL DA MÁQUINA DE ESTADOS (dívida técnica — item D).
//
// `TRANSICOES` (validators/movimentacao.ts) se declara, por COMENTÁRIO, "cópia EXATA"
// da matriz da spec §4 implementada em `status_apos_movimentacao` no banco. Até aqui
// nada travava essa promessa: uma transição nova no SQL (como a `troca` da 0047, ou a
// `devolucao_fornecedor` da 0045) NÃO quebrava o build do front — a divergência só
// aparecia em produção, como movimentação válida recusada pelo select (ou oferecida e
// recusada pelo trigger, virando erro de banco na cara do operador).
//
// Este teste deriva a matriz DIRETO do SQL da migration vigente e compara com o TS.
// Mesma técnica de `marcadores-sql.test.ts` (item H) — a única forma de ligar os dois
// lados sem um banco no processo do Vitest (o CI já sobe Postgres e roda os roteiros de
// `supabase/tests/`; aqui a rede é de compilação/teste puro, roda em milissegundos).
//
// Convenções da comparação (a matriz do formulário NÃO é 1:1 com a do SQL):
//   · `ajuste`  → a válvula de escape. O SQL devolve NULL e o trigger exige
//     status_resultante + justificativa; vale em QUALQUER estado, então entra em todos.
//   · `estorno` → também NULL no SQL, mas é fluxo da linha do tempo, nunca do
//     formulário de nova movimentação: fica FORA de TRANSICOES por decisão.
// Qualquer outra diferença é dívida real e quebra aqui.

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')
const TODOS_STATUS = Constants.public.Enums.status_ativo as readonly StatusAtivo[]

/** A migration VIGENTE da função: a de maior número que a redefine (`create or replace`). */
function migrationVigenteDaMatriz(): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    // ⚠ `create or replace function`, e não só o NOME da função — corrigido na F50.
    // O comentário desta função sempre disse "a que a REDEFINE", mas o filtro casava
    // qualquer menção. A `0129` só REVOGA o EXECUTE de `anon` dela
    // (`revoke execute on function public.status_apos_movimentacao(…)`) e, por ser a
    // de maior número, passou a ser eleita como "a vigente" — um arquivo sem
    // `return case`, que derrubava o teste inteiro no import. Qualquer migration
    // futura que apenas cite a função (um grant, um comentário) teria o mesmo efeito.
    .filter((f) =>
      readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes(
        'create or replace function public.status_apos_movimentacao',
      ),
    )
    .sort() // 0004 < 0024 < 0045 < 0047 — prefixo numérico zero-padded ordena lexicograficamente
  const arquivo = arquivos.at(-1)
  if (!arquivo) throw new Error('nenhuma migration define status_apos_movimentacao')
  return { arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }
}

/** Corpo do `return case … end` da ÚLTIMA definição da função dentro do arquivo. */
function corpoDoCase(sql: string): string {
  const inicioFn = sql.lastIndexOf('function public.status_apos_movimentacao')
  const trecho = sql.slice(inicioFn)
  const i = trecho.indexOf('return case')
  const f = trecho.indexOf('end;', i)
  if (i === -1 || f === -1) throw new Error('não achei o `return case … end;` da função')
  return trecho.slice(i, f)
}

/** Lista de literais de um `in ('a','b')`. */
function literais(lista: string): string[] {
  return [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

/**
 * Reconstrói, a partir do SQL, o mapa `status → tipos aceitos`, aplicando as duas
 * convenções acima (`ajuste` em todos, `estorno` fora).
 */
function matrizDoSql(sqlCase: string): Record<StatusAtivo, Set<TipoMovimentacao>> {
  const matriz = Object.fromEntries(
    TODOS_STATUS.map((s) => [s, new Set<TipoMovimentacao>()]),
  ) as Record<StatusAtivo, Set<TipoMovimentacao>>

  for (const linha of sqlCase.split('\n')) {
    if (!linha.trimStart().startsWith('when ')) continue

    // `when p_tipo in ('ajuste','estorno') then null` — tratado pelas convenções.
    const emLista = linha.match(/when\s+p_tipo\s+in\s+\(([^)]*)\)/)
    if (emLista) {
      const tipos = literais(emLista[1])
      // guarda: se um dia entrar aqui um tipo que não seja ajuste/estorno, o teste avisa
      expect(tipos.sort()).toEqual(['ajuste', 'estorno'])
      continue
    }

    const tipo = linha.match(/when\s+p_tipo\s*=\s*'([a-z_]+)'/)?.[1] as TipoMovimentacao | undefined
    if (!tipo) continue

    const negado = linha.match(/p_status\s+not\s+in\s+\(([^)]*)\)/)
    const positivo = linha.match(/p_status\s+in\s+\(([^)]*)\)/)

    const alvos = negado
      ? TODOS_STATUS.filter((s) => !literais(negado[1]).includes(s))
      : positivo
        ? (literais(positivo[1]) as StatusAtivo[])
        : []

    expect(alvos.length, `linha sem status reconhecido: ${linha.trim()}`).toBeGreaterThan(0)
    for (const s of alvos) matriz[s].add(tipo)
  }

  // `ajuste`: válvula de escape — vale em todo estado (o trigger cobra justificativa).
  for (const s of TODOS_STATUS) matriz[s].add('ajuste')
  return matriz
}

describe('TRANSICOES (TS) espelha status_apos_movimentacao (SQL da migration vigente)', () => {
  const { arquivo, sql } = migrationVigenteDaMatriz()
  const doSql = matrizDoSql(corpoDoCase(sql))

  it(`a migration vigente da matriz é ${'`'}${arquivo}${'`'} (guarda do próprio teste)`, () => {
    // Não é assert de nome: só prova que o parser achou uma matriz não-trivial. Se a
    // função for redefinida numa migration nova, este teste passa a lê-la sozinho.
    expect(Object.values(doSql).some((tipos) => tipos.size > 1)).toBe(true)
  })

  it('cobre exatamente os mesmos status do enum do banco', () => {
    expect(Object.keys(TRANSICOES).sort()).toEqual([...TODOS_STATUS].sort())
  })

  it.each(TODOS_STATUS)('status `%s`: os tipos do TS batem com o SQL', (status) => {
    expect([...TRANSICOES[status]].sort()).toEqual([...doSql[status]].sort())
  })

  it('`estorno` fica fora do formulário (fluxo da linha do tempo)', () => {
    for (const status of TODOS_STATUS) {
      expect(TRANSICOES[status]).not.toContain('estorno')
    }
  })

  it('todo tipo citado no TS existe no enum do banco', () => {
    const doBanco = new Set(Constants.public.Enums.tipo_movimentacao)
    for (const [status, tipos] of Object.entries(TRANSICOES)) {
      for (const t of tipos) {
        expect(doBanco.has(t), `${status} → ${t} não existe no enum tipo_movimentacao`).toBe(true)
      }
    }
  })
})
