import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import { TIPO_LANCAMENTO_META } from '@/lib/dominio'
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
// 19/08/2026 (avulsa) — a mensagem dizia "reserva e liberação", os nomes
// INTERNOS do enum: na tela esses tipos se chamam "Atrelar" e "Devolução", e
// "Liberação" é o rótulo de OUTRO tipo (saida), que não pede chamado nenhum.
// O operador escolhia "Devolução" e era cobrado por "liberação" — a ajuda
// mantinha uma tabela só para traduzir a divergência. Os rótulos saem de
// `TIPO_LANCAMENTO_META` (a fonte que o seletor usa): renomear lá renomeia
// aqui no mesmo build. `traduzErroBanco` (actions/erros.ts) reusa esta
// constante para a recusa vinda do CHECK `lanc_item_chamado` dizer o mesmo.
export const MSG_CHAMADO_OBRIGATORIO = `${TIPO_LANCAMENTO_META.reserva.rotulo} e ${TIPO_LANCAMENTO_META.liberacao.rotulo} exigem o número do chamado`
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

// ---- Transferência entre filiais (F31 · ITN-01) ----

/** Teto de linhas por transferência. O MESMO do lançamento, de propósito: é o
 *  mesmo carrinho, com o mesmo argumento (acima disso a tela vira lista de
 *  conferência e o operador perde o controle do que digitou). Uma constante
 *  própria seria uma segunda definição do mesmo limite. */
export const MAX_LINHAS_TRANSFERENCIA_ITEM = MAX_LINHAS_LOTE_ITEM

export const MSG_TRANSFERENCIA_MESMA_FILIAL =
  'A filial de destino não pode ser a mesma da origem'
export const MSG_TRANSFERENCIA_QTD =
  'A quantidade a transferir deve ser maior que zero'

/** Uma linha do carrinho de transferência. A quantidade é SEMPRE positiva aqui
 *  — quem inverte o sinal na perna de origem é a RPC (`−N` na origem, `+N` no
 *  destino), não a tela. */
export const linhaTransferenciaItemSchema = z.object({
  item_id: itemIdCampo,
  quantidade: quantidadeCampo.positive(MSG_TRANSFERENCIA_QTD),
})

// Origem, destino e os campos comuns valem para a transferência inteira; só
// item e quantidade variam por linha. Espelha `loteLancamentoItemSchema`.
export const transferenciaItemSchema = z
  .object({
    origem_id: filialIdCampo,
    destino_id: filialIdCampo,
    linhas: z
      .array(linhaTransferenciaItemSchema)
      .min(1, 'Adicione ao menos um item à transferência')
      .max(
        MAX_LINHAS_TRANSFERENCIA_ITEM,
        `A transferência aceita no máximo ${MAX_LINHAS_TRANSFERENCIA_ITEM} itens`,
      ),
    chamado: chamadoOpcional,
    data: dataNaoFuturaSchema,
    observacao: observacaoOpcional,
  })
  .superRefine((v, ctx) => {
    if (v.origem_id === v.destino_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['destino_id'],
        message: MSG_TRANSFERENCIA_MESMA_FILIAL,
      })
    }
    // Mesma regra do lote: o mesmo item duas vezes é sempre erro (some as
    // quantidades). Aqui ela é ainda mais necessária — duas linhas do mesmo
    // item viram quatro ajustes sobre o mesmo saldo, e o segundo par leria um
    // estoque que o primeiro já mexeu.
    for (const i of indicesDeItemRepetido(v.linhas)) {
      ctx.addIssue({ code: 'custom', path: ['linhas', i, 'item_id'], message: MSG_ITEM_REPETIDO })
    }
  })

export type TransferenciaItemInput = z.infer<typeof transferenciaItemSchema>

// Estorno de lançamento (histórico) — cria o lançamento inverso vinculado.
// ITN-05c — "Motivo (opcional)": some concatenado como "Estorno: {motivo}" na
// observação do inverso (`planejarEstorno`, `lib/itens/estorno.ts`) — nunca
// substitui o texto automático que ajuste/entrada já geravam.
export const TETO_MOTIVO_ESTORNO = 200
export const MSG_MOTIVO_ESTORNO_MAX = `Motivo do estorno: no máximo ${TETO_MOTIVO_ESTORNO} caracteres`

const motivoEstornoOpcional = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().max(TETO_MOTIVO_ESTORNO, MSG_MOTIVO_ESTORNO_MAX).optional(),
)

export const estornoLancamentoSchema = z.object({
  lancamento_id: z.string().uuid('Lançamento inválido'),
  motivo: motivoEstornoOpcional,
})

// ---- Catálogo (admin/itens) ----

export const itemCatalogoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  grupo: z.enum(Constants.public.Enums.grupo_item, { message: 'Escolha o grupo' }),
  ordem: z.coerce.number().int('Ordem inteira').min(0).max(999).default(0),
  // Ponto de reposição (F12 · I5). Espelha a coluna `itens.estoque_minimo`
  // (migration 0042: int not null default 0 check >= 0). 0 = SEM alerta.
  estoque_minimo: z.coerce
    .number()
    .int('Estoque mínimo inteiro')
    .min(0, 'O estoque mínimo não pode ser negativo')
    .max(9999, 'Estoque mínimo: no máximo 9999')
    .default(0),
})

export const atualizarItemSchema = itemCatalogoSchema.extend({
  id: z.coerce.number().int().positive(),
  ativo: z.boolean(),
})

// Criação INLINE no meio do lançamento (F10 · I2): o operador só informa nome e
// grupo — a ordem é calculada no servidor (o combobox nem carrega essa coluna) e
// o estoque mínimo nasce no default 0 do banco (quem define ponto de reposição é
// o admin em admin/itens, com o saldo na frente — não quem está no meio de um
// lançamento).
export const itemInlineSchema = itemCatalogoSchema
  .omit({
    ordem: true,
    estoque_minimo: true,
  })
  .extend({
    // F41 — o TIPO com que o item nasce. Criado a partir de uma linha do checklist
    // da devolução, o item já nasce com o `tipo_id` daquela linha, e isso fecha de
    // graça o buraco do MSG_SEM_ITEM_DO_TIPO ("nenhum item de catálogo deste tipo —
    // a devolução foi registrada, mas o estoque não mudou"): o item que acabou de
    // ser criado JÁ resolve pela ponte tipo→item na próxima devolução.
    // Opcional porque o cadastro por /admin/itens e o inline fora do checklist não
    // têm tipo nenhum a herdar.
    tipo_id: z.number().int().positive().nullish(),
  })

/** Próxima `ordem` do grupo: 10 acima da maior existente (deixa espaço para
 *  reordenar à mão em admin/itens), 0 no grupo vazio, teto 999 do schema. */
export function proximaOrdemDoGrupo(maiorOrdem: number | null | undefined): number {
  if (maiorOrdem == null || !Number.isFinite(maiorOrdem)) return 0
  return Math.min(999, Math.max(0, Math.trunc(maiorOrdem) + 10))
}

// ---- Ponto de reposição (F12 · I5) ----

/** O item precisa ser reposto? Regra ÚNICA do alerta "repor" — usada pelo badge
 *  de /itens e pelo card do dashboard, para os dois nunca discordarem.
 *
 *  `estoqueMinimo <= 0` desliga o alerta (0 é o default da coluna e significa
 *  "não acompanho este item"; negativo é impossível pelo check da 0042, mas aqui
 *  também desliga em vez de alertar por acidente).
 *
 *  ⚠ O ESCOPO DO PRIMEIRO ARGUMENTO É DE QUEM CHAMA, e mudou na F44
 *  (01/09/2026). Até a v1.48.0 ele era SEMPRE o estoque consolidado — decisão de
 *  22/07/2026, "o mínimo é do ITEM, não da filial" —, e o parâmetro se chamava
 *  `estoqueConsolidado`. Hoje: `/itens` passa o estoque do RECORTE (`linha.saldo`,
 *  ver `components/itens/badge-repor.tsx`), e o card do PAINEL INICIAL continua
 *  passando o consolidado, porque não tem filtro de filial. As duas contas estão
 *  certas e podem divergir — a ajuda do operador avisa disso em
 *  `lib/ajuda/conteudo/saldos-e-estoque-minimo.ts`.
 *
 *  O mínimo em si é UM SÓ por item (`itens.estoque_minimo`, migration 0042); não
 *  existe mínimo por filial. Estoque IGUAL ao mínimo NÃO repõe: o mínimo é o piso
 *  aceitável, não o gatilho.
 *
 *  Não confundir com "faltam N" (spec §7), que é `atrelados − estoque`: aquilo é
 *  compromisso já assumido; isto é previsão de compra. */
export function precisaRepor(estoque: number, estoqueMinimo: number): boolean {
  return estoqueMinimo > 0 && estoque < estoqueMinimo
}
