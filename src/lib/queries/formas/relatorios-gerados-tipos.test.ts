import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import type { AnySnapshot } from '@/lib/relatorios/tipos'
import { FORMA_SNAPSHOT } from '@/lib/queries/formas/relatorios-gerados'

// A PROVA DA ATRIBUIBILIDADE — em COMPILAÇÃO (F58 · Frente C · lote 4).
//
// `buscarRelatorioGerado` devolve `snapshot: r.dados` (sem `as`) onde `r.dados` é
// `z.output<typeof FORMA_SNAPSHOT>` e o campo declarado é `AnySnapshot`. Esta função só compila
// se a saída da forma for atribuível a `AnySnapshot` SEM cast — é a mesma disciplina de
// `linhas-tipos.test.ts`: quem prova é o `tsc`, o `it` abaixo só confere que o arquivo carregou.
// Se um campo da forma divergir de `lib/relatorios/tipos.ts` (opcional virando obrigatório, tipo
// trocado, chave faltando), o build fica vermelho AQUI, e não silenciosamente num `as` que
// ninguém mais audita.
export function aceita(s: z.output<typeof FORMA_SNAPSHOT>): AnySnapshot {
  return s
}

describe('a saída de FORMA_SNAPSHOT é atribuível a AnySnapshot sem `as` (prova em compilação)', () => {
  it('o arquivo carrega — a prova é do `tsc`, não deste teste', () => {
    expect(typeof aceita).toBe('function')
  })
})
