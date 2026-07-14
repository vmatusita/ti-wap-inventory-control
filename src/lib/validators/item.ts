import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { dataNaoFuturaSchema } from '@/lib/validators/data'

// Validadores compartilhados (cliente E servidor) do lançamento de item por
// quantidade e do catálogo (F3B). Espelham as constraints/trigger da migration
// 0015 — a regra crítica vive no Postgres; aqui é a segunda linha (CLAUDE.md).

// Chamado: dígitos como texto (padrão da movimentação). Vazio = ausente. A
// obrigatoriedade em reserva/liberação é checada no superRefine.
const chamadoOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().regex(/^\d+$/, 'O chamado deve conter apenas números').max(20).optional(),
)

const colaboradorOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().max(120).optional(),
)

const observacaoOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().max(500, 'Observação: no máximo 500 caracteres').optional(),
)

const tipoLancamento = Constants.public.Enums.tipo_lancamento

// Um único schema com superRefine (a union discriminada exigiria discriminador
// literal por tipo; aqui a regra varia por `tipo` de forma cruzada).
export const lancamentoItemSchema = z
  .object({
    item_id: z.coerce.number({ message: 'Escolha o item' }).int().positive('Escolha o item'),
    filial_id: z.coerce.number({ message: 'Escolha a filial' }).int().positive('Escolha a filial'),
    tipo: z.enum(tipoLancamento, { message: 'Escolha o tipo do lançamento' }),
    quantidade: z.coerce
      .number({ message: 'Informe a quantidade' })
      .int('A quantidade deve ser inteira'),
    chamado: chamadoOpcional,
    colaborador: colaboradorOpcional,
    data: dataNaoFuturaSchema,
    observacao: observacaoOpcional,
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'ajuste') {
      if (v.quantidade === 0) {
        ctx.addIssue({ code: 'custom', path: ['quantidade'], message: 'O ajuste não pode ser zero' })
      }
      if (!v.observacao || v.observacao.trim().length < 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['observacao'],
          message: 'A justificativa do ajuste é obrigatória (mín. 3 caracteres)',
        })
      }
    } else if (!(v.quantidade > 0)) {
      ctx.addIssue({ code: 'custom', path: ['quantidade'], message: 'A quantidade deve ser maior que zero' })
    }

    if ((v.tipo === 'reserva' || v.tipo === 'liberacao') && !v.chamado) {
      ctx.addIssue({
        code: 'custom',
        path: ['chamado'],
        message: 'O chamado é obrigatório em reserva e liberação',
      })
    }
  })

export type LancamentoItemInput = z.infer<typeof lancamentoItemSchema>

// Estorno de lançamento (histórico) — cria o lançamento inverso vinculado.
export const estornoLancamentoSchema = z.object({
  lancamento_id: z.string().uuid('Lançamento inválido'),
})

// ---- Catálogo (admin/itens) ----

export const itemCatalogoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  grupo: z.enum(Constants.public.Enums.grupo_item, { message: 'Escolha o grupo' }),
  ordem: z.coerce.number().int('Ordem inteira').min(0).max(999).default(0),
})

export const atualizarItemSchema = itemCatalogoSchema.extend({
  id: z.coerce.number().int().positive(),
  ativo: z.boolean(),
})
