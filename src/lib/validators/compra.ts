import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { hojeISO } from '@/lib/format'
import { MAX_LOTE_COMPRA, PATRIMONIO_CANONICAL_RE } from '@/lib/patrimonio'

// Entrada de equipamento novo (tipo `compra` — spec §8 regra 8 / OS-F2 3.5.5).
// Cadastra o ativo (nasce em_estoque) + registra a movimentação `compra`.

const opcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().optional(),
)

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((d) => d <= hojeISO(), 'A data não pode ser futura')

export const compraItemSchema = z.object({
  patrimonio: z
    .string()
    .regex(PATRIMONIO_CANONICAL_RE, 'Patrimônio fora do formato canônico (ex.: WAP0006026)'),
  service_tag: opcional,
})

export const compraLoteSchema = z.object({
  itens: z
    .array(compraItemSchema)
    .min(1, 'Adicione ao menos um patrimônio')
    .max(MAX_LOTE_COMPRA, `O lote aceita no máximo ${MAX_LOTE_COMPRA} itens`),
  // Dados cadastrais compartilhados do modelo comprado (OS-F2 3.3.1 / 3.5.5).
  categoria: z.enum(Constants.public.Enums.categoria_ativo, {
    message: 'Escolha a categoria',
  }),
  marca: z.string().trim().min(1, 'Informe a marca'),
  modelo: z.string().trim().min(1, 'Informe o modelo'),
  memoria: opcional,
  armazenamento: opcional,
  processador: opcional,
  fornecedor: opcional,
  filial_id: z.number().int().positive('Escolha a filial que recebeu'),
  // Observação da compra (nº da nota fiscal etc.) — vai na movimentação `compra`.
  observacao: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().trim().max(500, 'Observação: no máximo 500 caracteres').optional(),
  ),
  data: dataSchema,
})

export type CompraLoteInput = z.infer<typeof compraLoteSchema>
