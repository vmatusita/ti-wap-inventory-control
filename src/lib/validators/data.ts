import { z } from 'zod'
import { hojeISO } from '@/lib/format'
import { dataISO } from '@/lib/url-params'

// Schemas de DATA compartilhados (cliente E servidor). Antes o par "regex +
// não-futura" estava reescrito em movimentacao/item/compra e nas actions de
// relatório. Fonte única aqui.
//
// Obs.: `format.ts` mantém seu próprio DATA_PURA_RE de propósito — ele é
// importado por este módulo (hojeISO), então importar daqui criaria um ciclo.

// Data pura no formato yyyy-MM-dd.
export const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// O regex confere só a FORMA: `2026-02-30` e `0000-01-01` passam nele e chegam ao
// Postgres, que responde 22008 — a operadora recebe "Não foi possível concluir a
// operação" para um erro que a validação devia ter apontado no campo. `dataISO`
// (@/lib/url-params) faz o round-trip de `Date` + faixa sã e é a fonte única
// dessa régua no projeto. Refine, e não `transform`: o schema continua devolvendo
// `string`, então nenhum chamador muda.
const dataReal = (d: string) => dataISO(d) !== null
const MSG_DATA_REAL = 'Data inexistente ou fora da faixa aceita'

// Data pura, obrigatória e NÃO-futura (spec §8). O teto é `hojeISO()` no fuso de
// São Paulo — o servidor não pode usar a data UTC do processo (aceitaria "amanhã"
// perto da meia-noite no Brasil).
export const dataNaoFuturaSchema = z
  .string()
  .regex(DATA_RE, 'Data inválida')
  .refine(dataReal, MSG_DATA_REAL)
  .refine((d) => d <= hojeISO(), 'A data não pode ser futura')

// Data pura opcional, sem regra de futuro (ex.: termo_data).
export const dataOpcionalSchema = z
  .string()
  .regex(DATA_RE, 'Data inválida')
  .refine(dataReal, MSG_DATA_REAL)
  .optional()

// Data pura obrigatória e EXISTENTE, sem regra de futuro — para os intervalos
// (`de`/`ate` da geração de relatório), onde o teto é próprio de quem chama.
export function dataRealSchema(rotulo: string) {
  return z.string().regex(DATA_RE, rotulo).refine(dataReal, rotulo)
}
