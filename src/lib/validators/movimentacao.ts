import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { hojeISO } from '@/lib/format'
import type { StatusAtivo, TipoMovimentacao } from '@/lib/dominio'

// ---------------------------------------------------------------------------
// TRANSICOES — copia EXATA da tabela da spec §4 (0004 no banco), invertida por
// ESTADO: para cada status, os tipos de movimentacao que o banco aceita. Serve
// SO para filtrar o select de tipos na UI (OS-F2 3.3.2); a validacao de verdade
// e o trigger `aplicar_movimentacao`. `estorno` nao entra (e o fluxo da linha do
// tempo, nao do formulario de nova movimentacao). `ajuste` entra em todos os
// estados — e a valvula de escape (exige status_resultante + justificativa).
// ---------------------------------------------------------------------------
export const TRANSICOES: Record<StatusAtivo, TipoMovimentacao[]> = {
  em_estoque: [
    'compra',
    'saida',
    'emprestimo',
    'reserva',
    'envio_manutencao',
    'marcar_defasado',
    'descarte',
    'transferencia',
    'ajuste',
  ],
  reservado: ['saida', 'emprestimo', 'transferencia', 'ajuste'],
  em_uso: ['devolucao', 'envio_manutencao', 'transferencia', 'ajuste'],
  emprestado: ['devolucao', 'transferencia', 'ajuste'],
  em_triagem: [
    'saida',
    'triagem_ok',
    'envio_manutencao',
    'marcar_defasado',
    'descarte',
    'transferencia',
    'ajuste',
  ],
  em_manutencao: [
    'retorno_manutencao',
    'marcar_defasado',
    'descarte',
    'transferencia',
    'ajuste',
  ],
  defasado: ['envio_manutencao', 'descarte', 'transferencia', 'ajuste'],
  descartado: ['ajuste'],
}

// Tipos validos para TODOS os itens de um lote (intersecao). Usado no fluxo em
// lote: so oferece um tipo que caiba em todos os ativos selecionados.
export function tiposComunsPara(status: StatusAtivo[]): TipoMovimentacao[] {
  if (status.length === 0) return []
  const conjuntos = status.map((s) => new Set(TRANSICOES[s]))
  const [primeiro, ...resto] = conjuntos
  return [...primeiro].filter((t) => resto.every((s) => s.has(t)))
}

// ---------------------------------------------------------------------------
// SCHEMAS
// ---------------------------------------------------------------------------

const termoEnum = z.enum(Constants.public.Enums.termo_status)

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// Data obrigatoria, formato yyyy-MM-dd e nao-futura (spec §8 / OS-F2 3.3.1).
// `hojeISO()` fixa o fuso de São Paulo — o servidor não pode usar a data UTC do
// processo (aceitaria "amanhã" perto da meia-noite no Brasil).
const dataSchema = z
  .string()
  .regex(DATA_RE, 'Data inválida')
  .refine((d) => d <= hojeISO(), 'A data não pode ser futura')

// Data opcional (termo_data) — mesmo formato, sem regra de futuro.
const dataOpcionalSchema = z
  .string()
  .regex(DATA_RE, 'Data inválida')
  .optional()

// Chamado: opcional, numerico como texto (OS-F2 3.3.1). String vazia = ausente.
const chamadoSchema = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^\d+$/, 'O chamado deve conter apenas números')
    .optional(),
)

const textoOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().optional(),
)

// Observacao livre: opcional, ate 500 (spec §8 regra 9).
const observacaoOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().max(500, 'Observação: no máximo 500 caracteres').optional(),
)

// Campos comuns a toda movimentacao.
const base = z.object({
  ativo_id: z.string().uuid('Ativo inválido'),
  data: dataSchema,
  chamado: chamadoSchema,
  termo_assinado: termoEnum.optional(),
  termo_data: dataOpcionalSchema,
  observacao: observacaoOpcional,
})

// saida / emprestimo: (colaborador OU setor) + motivo. A regra "colaborador OU
// setor" e checada no superRefine da uniao (abaixo).
const saidaSchema = base.extend({
  tipo: z.literal('saida'),
  motivo: z.string().trim().min(1, 'Informe o motivo'),
  colaborador: textoOpcional,
  setor: textoOpcional,
})
const emprestimoSchema = base.extend({
  tipo: z.literal('emprestimo'),
  motivo: z.string().trim().min(1, 'Informe o motivo'),
  colaborador: textoOpcional,
  setor: textoOpcional,
})

// reserva: separa p/ alguem (opcionalmente colaborador/setor/motivo).
const reservaSchema = base.extend({
  tipo: z.literal('reserva'),
  motivo: textoOpcional,
  colaborador: textoOpcional,
  setor: textoOpcional,
})

// devolucao: motivo + checklist de itens faltantes (pode ser vazio).
const devolucaoSchema = base.extend({
  tipo: z.literal('devolucao'),
  motivo: z.string().trim().min(1, 'Informe o motivo'),
  itens_faltantes: z.array(z.string().trim().min(1)).default([]),
})

// transferencia: filial destino obrigatoria. O "≠ filial atual" e checado no
// formulario (esconde a filial atual) e reconferido na Server Action, onde a
// filial corrente do ativo e conhecida.
const transferenciaSchema = base.extend({
  tipo: z.literal('transferencia'),
  filial_destino_id: z.number().int().positive('Escolha a filial de destino'),
})

// ajuste: valvula de escape — status_resultante + justificativa (≥10). Aqui a
// observacao deixa de ser opcional (override do base).
const ajusteSchema = base.extend({
  tipo: z.literal('ajuste'),
  // Mensagens em pt-BR também para o caso ausente (senão o Zod devolve o texto
  // padrão em inglês, que vazaria na lista "Revise antes de continuar").
  status_resultante: z.enum(Constants.public.Enums.status_ativo, {
    message: 'Escolha o novo status do ativo',
  }),
  observacao: z
    .string({ message: 'A justificativa do ajuste é obrigatória' })
    .trim()
    .min(10, 'A justificativa do ajuste precisa de ao menos 10 caracteres')
    .max(500, 'Observação: no máximo 500 caracteres'),
})

// estorno: aponta para a movimentacao original (fluxo da linha do tempo).
const estornoSchema = base.extend({
  tipo: z.literal('estorno'),
  estorno_de: z.string().uuid('Movimentação de origem inválida'),
})

// Tipos "simples": so os campos comuns + motivo opcional.
function simples<T extends TipoMovimentacao>(tipo: T) {
  return base.extend({
    tipo: z.literal(tipo),
    motivo: textoOpcional,
  })
}

export const movimentacaoSchema = z
  .discriminatedUnion('tipo', [
    saidaSchema,
    emprestimoSchema,
    reservaSchema,
    devolucaoSchema,
    transferenciaSchema,
    ajusteSchema,
    estornoSchema,
    simples('compra'),
    simples('triagem_ok'),
    simples('envio_manutencao'),
    simples('retorno_manutencao'),
    simples('marcar_defasado'),
    simples('descarte'),
  ])
  .superRefine((val, ctx) => {
    if (val.tipo === 'saida' || val.tipo === 'emprestimo') {
      const temColab = 'colaborador' in val && !!val.colaborador?.trim()
      const temSetor = 'setor' in val && !!val.setor?.trim()
      if (!temColab && !temSetor) {
        ctx.addIssue({
          code: 'custom',
          path: ['colaborador'],
          message: 'Informe o colaborador ou o setor de destino',
        })
      }
    }
  })

export type MovimentacaoInput = z.infer<typeof movimentacaoSchema>

// Lote de 1 a 10 movimentacoes (OS-F2 3.4.1).
export const loteMovimentacaoSchema = z.object({
  itens: z
    .array(movimentacaoSchema)
    .min(1, 'Adicione ao menos um item ao lote')
    .max(10, 'O lote aceita no máximo 10 itens'),
})

export type LoteMovimentacaoInput = z.infer<typeof loteMovimentacaoSchema>

// Estorno disparado pela linha do tempo (id da movimentacao + observacao livre).
export const estornoActionSchema = z.object({
  movimentacao_id: z.string().uuid('Movimentação inválida'),
  observacao: observacaoOpcional,
})
