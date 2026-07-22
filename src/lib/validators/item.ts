import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { dataNaoFuturaSchema } from '@/lib/validators/data'

// Validadores compartilhados (cliente E servidor) do lançamento de item por
// quantidade e do catálogo (F3B). Espelham as constraints/trigger da migration
// 0015 — a regra crítica vive no Postgres; aqui é a segunda linha (CLAUDE.md).
//
// F10 · I1: o lançamento passa a aceitar um CARRINHO de linhas
// (`loteLancamentoItemSchema`) sobre os mesmos campos comuns. As regras por tipo
// (chamado em reserva/liberação, justificativa no ajuste, sinal da quantidade)
// são as MESMAS do lançamento simples — extraídas em funções puras para não
// existirem em duas cópias.

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

// Campos-peça reutilizados pelo lançamento simples e pelo lote (mesmas mensagens).
const itemIdCampo = z.coerce
  .number({ message: 'Escolha o item' })
  .int()
  .positive('Escolha o item')
const filialIdCampo = z.coerce
  .number({ message: 'Escolha a filial' })
  .int()
  .positive('Escolha a filial')
const tipoCampo = z.enum(tipoLancamento, { message: 'Escolha o tipo do lançamento' })
const quantidadeCampo = z.coerce
  .number({ message: 'Informe a quantidade' })
  .int('A quantidade deve ser inteira')

export const MSG_JUSTIFICATIVA_AJUSTE =
  'A justificativa do ajuste é obrigatória (mín. 3 caracteres)'
export const MSG_CHAMADO_OBRIGATORIO = 'O chamado é obrigatório em reserva e liberação'
export const MSG_ITEM_REPETIDO =
  'Este item já está no lançamento — some as quantidades em uma linha só'

// ---- Regras puras (mesmas do trigger 0015/0027, na segunda linha) ----

/** Quantidade válida para o tipo? Ajuste aceita negativo mas nunca zero; os
 *  demais tipos exigem quantidade positiva. Devolve a mensagem ou `null`. */
export function erroQuantidadeLancamento(tipo: string, quantidade: number): string | null {
  if (tipo === 'ajuste') {
    return quantidade === 0 ? 'O ajuste não pode ser zero' : null
  }
  return quantidade > 0 ? null : 'A quantidade deve ser maior que zero'
}

/** Reserva e liberação exigem o número do chamado (constraint `lanc_item_chamado`). */
export function exigeChamado(tipo: string): boolean {
  return tipo === 'reserva' || tipo === 'liberacao'
}

/** Ajuste exige justificativa de pelo menos 3 caracteres (`lanc_item_ajuste_obs`). */
export function faltaJustificativaAjuste(tipo: string, observacao?: string | null): boolean {
  return tipo === 'ajuste' && (observacao ?? '').trim().length < 3
}

/** Índices das linhas que REPETEM um item já usado antes no carrinho (2ª
 *  ocorrência em diante). O mesmo item duas vezes no mesmo lançamento é sempre
 *  erro: some as quantidades. */
export function indicesDeItemRepetido(linhas: readonly { item_id: number }[]): number[] {
  const vistos = new Set<number>()
  const repetidos: number[] = []
  linhas.forEach((l, i) => {
    if (vistos.has(l.item_id)) repetidos.push(i)
    else vistos.add(l.item_id)
  })
  return repetidos
}

// Um único schema com superRefine (a union discriminada exigiria discriminador
// literal por tipo; aqui a regra varia por `tipo` de forma cruzada).
export const lancamentoItemSchema = z
  .object({
    item_id: itemIdCampo,
    filial_id: filialIdCampo,
    tipo: tipoCampo,
    quantidade: quantidadeCampo,
    chamado: chamadoOpcional,
    colaborador: colaboradorOpcional,
    data: dataNaoFuturaSchema,
    observacao: observacaoOpcional,
  })
  .superRefine((v, ctx) => {
    const erroQtd = erroQuantidadeLancamento(v.tipo, v.quantidade)
    if (erroQtd) {
      ctx.addIssue({ code: 'custom', path: ['quantidade'], message: erroQtd })
    }
    if (faltaJustificativaAjuste(v.tipo, v.observacao)) {
      ctx.addIssue({ code: 'custom', path: ['observacao'], message: MSG_JUSTIFICATIVA_AJUSTE })
    }
    if (exigeChamado(v.tipo) && !v.chamado) {
      ctx.addIssue({ code: 'custom', path: ['chamado'], message: MSG_CHAMADO_OBRIGATORIO })
    }
  })

export type LancamentoItemInput = z.infer<typeof lancamentoItemSchema>

// ---- Carrinho multi-item (F10 · I1) ----

/** Teto de linhas por lançamento. Uma NF real cabe folgada; acima disso a tela
 *  vira lista de conferência e o operador perde o controle do que digitou. */
export const MAX_LINHAS_LOTE_ITEM = 10

export const linhaLoteItemSchema = z.object({
  item_id: itemIdCampo,
  quantidade: quantidadeCampo,
})

// Os campos comuns (filial, tipo, chamado, colaborador, data, observação) valem
// para o lançamento INTEIRO; só item e quantidade variam por linha.
export const loteLancamentoItemSchema = z
  .object({
    filial_id: filialIdCampo,
    tipo: tipoCampo,
    linhas: z
      .array(linhaLoteItemSchema)
      .min(1, 'Adicione ao menos um item ao lançamento')
      .max(MAX_LINHAS_LOTE_ITEM, `O lançamento aceita no máximo ${MAX_LINHAS_LOTE_ITEM} itens`),
    chamado: chamadoOpcional,
    colaborador: colaboradorOpcional,
    data: dataNaoFuturaSchema,
    observacao: observacaoOpcional,
  })
  .superRefine((v, ctx) => {
    v.linhas.forEach((l, i) => {
      const erroQtd = erroQuantidadeLancamento(v.tipo, l.quantidade)
      if (erroQtd) {
        ctx.addIssue({ code: 'custom', path: ['linhas', i, 'quantidade'], message: erroQtd })
      }
    })
    for (const i of indicesDeItemRepetido(v.linhas)) {
      ctx.addIssue({ code: 'custom', path: ['linhas', i, 'item_id'], message: MSG_ITEM_REPETIDO })
    }
    if (faltaJustificativaAjuste(v.tipo, v.observacao)) {
      ctx.addIssue({ code: 'custom', path: ['observacao'], message: MSG_JUSTIFICATIVA_AJUSTE })
    }
    if (exigeChamado(v.tipo) && !v.chamado) {
      ctx.addIssue({ code: 'custom', path: ['chamado'], message: MSG_CHAMADO_OBRIGATORIO })
    }
  })

export type LoteLancamentoItemInput = z.infer<typeof loteLancamentoItemSchema>

/** Abre o carrinho em lançamentos individuais, na ORDEM das linhas — é assim que
 *  a action insere (uma linha por vez; o trigger de saldo é o juiz de cada uma). */
export function explodirLoteLancamentoItem(
  lote: LoteLancamentoItemInput,
): LancamentoItemInput[] {
  return lote.linhas.map((l) => ({
    item_id: l.item_id,
    filial_id: lote.filial_id,
    tipo: lote.tipo,
    quantidade: l.quantidade,
    chamado: lote.chamado,
    colaborador: lote.colaborador,
    data: lote.data,
    observacao: lote.observacao,
  }))
}

/** Mapeia as issues do lote para a linha do carrinho (primeira mensagem de cada
 *  linha), para a UI marcar a linha culpada em vez de só mostrar um toast. */
export function errosPorLinhaDoLote(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): Map<number, string> {
  const porLinha = new Map<number, string>()
  for (const issue of issues) {
    if (issue.path[0] !== 'linhas') continue
    const i = issue.path[1]
    if (typeof i !== 'number' || porLinha.has(i)) continue
    porLinha.set(i, issue.message)
  }
  return porLinha
}

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

// Criação INLINE no meio do lançamento (F10 · I2): o operador só informa nome e
// grupo — a ordem é calculada no servidor (o combobox nem carrega essa coluna).
export const itemInlineSchema = itemCatalogoSchema.omit({ ordem: true })

/** Próxima `ordem` do grupo: 10 acima da maior existente (deixa espaço para
 *  reordenar à mão em admin/itens), 0 no grupo vazio, teto 999 do schema. */
export function proximaOrdemDoGrupo(maiorOrdem: number | null | undefined): number {
  if (maiorOrdem == null || !Number.isFinite(maiorOrdem)) return 0
  return Math.min(999, Math.max(0, Math.trunc(maiorOrdem) + 10))
}
