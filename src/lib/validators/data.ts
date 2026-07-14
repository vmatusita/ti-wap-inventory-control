import { z } from 'zod'
import { hojeISO } from '@/lib/format'

// Schemas de DATA compartilhados (cliente E servidor). Antes o par "regex +
// não-futura" estava reescrito em movimentacao/item/compra e nas actions de
// relatório. Fonte única aqui.
//
// Obs.: `format.ts` mantém seu próprio DATA_PURA_RE de propósito — ele é
// importado por este módulo (hojeISO), então importar daqui criaria um ciclo.

// Data pura no formato yyyy-MM-dd.
export const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// Data pura, obrigatória e NÃO-futura (spec §8). O teto é `hojeISO()` no fuso de
// São Paulo — o servidor não pode usar a data UTC do processo (aceitaria "amanhã"
// perto da meia-noite no Brasil).
export const dataNaoFuturaSchema = z
  .string()
  .regex(DATA_RE, 'Data inválida')
  .refine((d) => d <= hojeISO(), 'A data não pode ser futura')

// Data pura opcional, sem regra de futuro (ex.: termo_data).
export const dataOpcionalSchema = z
  .string()
  .regex(DATA_RE, 'Data inválida')
  .optional()
