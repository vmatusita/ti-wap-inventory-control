import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { dataNaoFuturaSchema } from '@/lib/validators/data'
import { PATRIMONIO_CANONICAL_RE } from '@/lib/patrimonio'

// F14/MN3–MN4 — validadores da DEVOLUÇÃO AO FORNECEDOR (fluxo dedicado, lote
// sempre 1). O padrão é cadastrar o SUBSTITUTO no mesmo submit (modelo do "Novo
// equipamento" da compra); existe a opção "sem substituto" (fornecedor não repôs).
//
// Os CHAMADOS (interno + do fornecedor) NÃO entram aqui: são herdados da última
// movimentação `envio_manutencao` do ativo e resolvidos NO SERVIDOR pela action
// (autoridade + trata ativos legados sem o campo). O FORNECEDOR do substituto
// também é herdado no servidor (pela RPC), nunca vem do cliente.

const opcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().optional(),
)

const textoMax500 = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().max(500, 'No máximo 500 caracteres').optional(),
)

// Sub-form do SUBSTITUTO (MN4): reusa as regras cadastrais da compra
// (patrimônio canônico, categoria/marca/modelo obrigatórios). Coleta `hostname`,
// que a compra normal não coleta. NÃO tem `fornecedor` (herdado do ativo antigo)
// nem os chamados.
export const substitutoSchema = z.object({
  patrimonio: z
    .string()
    .regex(
      PATRIMONIO_CANONICAL_RE,
      'Patrimônio fora do formato canônico (ex.: WAP0006026)',
    ),
  // F15/C1 — service tag OBRIGATÓRIA no cadastro do substituto (espelho da compra).
  service_tag: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string({ message: 'Informe a service tag' }).trim().min(1, 'Informe a service tag'),
  ),
  categoria: z.enum(Constants.public.Enums.categoria_ativo, {
    message: 'Escolha a categoria',
  }),
  marca: z.string().trim().min(1, 'Informe a marca'),
  modelo: z.string().trim().min(1, 'Informe o modelo'),
  memoria: opcional,
  armazenamento: opcional,
  processador: opcional,
  hostname: opcional,
  filial_id: z.number().int().positive('Escolha a filial'),
  observacoes: textoMax500, // cadastro do ativo
  observacao: textoMax500, // F15: vai na movimentação `troca` do substituto (não `compra`)
  data: dataNaoFuturaSchema,
})

export type SubstitutoInput = z.infer<typeof substitutoSchema>

export const devolverFornecedorSchema = z.object({
  ativo_id: z.string().uuid('Ativo inválido'),
  data: dataNaoFuturaSchema,
  observacao: textoMax500, // vai na movimentação `devolucao_fornecedor`
  // null = sem substituto (fornecedor não repôs — crédito/estorno).
  substituto: substitutoSchema.nullable(),
})

export type DevolverFornecedorInput = z.infer<typeof devolverFornecedorSchema>
