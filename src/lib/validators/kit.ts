import { z } from 'zod'
import { Constants } from '@/lib/types/database'
import {
  CATEGORIA_ORDEM,
  type CategoriaAtivo,
  type TermoStatus,
  type TipoMovimentacao,
} from '@/lib/dominio'

// Validadores compartilhados (cliente E servidor) dos KITS DE MOVIMENTAÇÃO
// (F12 · M12 — promessa da F5 §5.9). Um kit é um MODELO nomeado da configuração
// do passo 2 da nova movimentação: tipo, motivo, termo, observação e as
// categorias que se espera movimentar junto ("Kit novo colaborador" = notebook +
// monitor + celular).
//
// O kit NÃO é regra de negócio: aplicá-lo só preenche o formulário, e o
// formulário continua passando pelos validadores de movimentação (que são a
// segunda linha da máquina de estados no Postgres). Por isso aqui não há
// superRefine por tipo — o que este arquivo garante é que o payload guardado no
// jsonb seja SEMPRE um documento com a forma esperada, vindo de onde vier.

// ---- Tipos aceitos no kit ----

// `compra` fica de fora porque a entrada de equipamento novo tem tela própria
// (/ativos/novo) e já sai filtrada do fluxo (`tiposDoLote` em
// nova-movimentacao-form.tsx). `estorno` fica de fora porque nunca é escolhido
// num formulário: nasce do botão "Estornar" de uma movimentação existente e
// precisa apontar a origem. Um kit de qualquer um dos dois seria inaplicável.
//
// Lista LITERAL (o `z.enum` precisa de tupla, não de `TipoMovimentacao[]`), com
// um teste que trava a equivalência com `Constants.public.Enums.tipo_movimentacao`
// menos os dois excluídos — mesma doutrina do `TERMO_STATUS_ORDEM` (dominio.ts):
// se o enum do banco mudar, o teste quebra em vez de o select ficar mudo.
export const TIPOS_EXCLUIDOS_DO_KIT = ['compra', 'estorno'] as const

export const TIPOS_KIT = [
  'saida',
  'emprestimo',
  'reserva',
  'devolucao',
  'triagem_ok',
  'envio_manutencao',
  'retorno_manutencao',
  'marcar_defasado',
  'descarte',
  'transferencia',
  'ajuste',
] as const satisfies readonly TipoMovimentacao[]

export type TipoKit = (typeof TIPOS_KIT)[number]

// ---- Payload (o que vai no jsonb) ----

export type KitPayload = {
  tipo: TipoMovimentacao
  motivo?: string
  termo?: TermoStatus
  observacao?: string
  categorias: CategoriaAtivo[]
}

// Texto opcional do preset. Diferente do `observacaoOpcional` das movimentações
// (que só trata `''`), aqui SÓ-ESPAÇOS também vira ausente: o payload é
// PERSISTIDO em jsonb, e `{"observacao":"  "}` e `{}` significam a mesma coisa —
// dois documentos diferentes para o mesmo kit é ruído garantido no futuro.
const textoOpcional = (max: number, msg: string) =>
  z.preprocess(
    (v) => {
      if (v == null) return undefined
      if (typeof v !== 'string') return v
      const t = v.trim()
      return t === '' ? undefined : t
    },
    z.string().trim().max(max, msg).optional(),
  )

export const MSG_KIT_SEM_CATEGORIA = 'Escolha ao menos uma categoria esperada'
export const MSG_KIT_CATEGORIA_REPETIDA = 'Não repita a mesma categoria no kit'

export const kitPayloadSchema = z.object({
  tipo: z.enum(TIPOS_KIT, { message: 'Escolha o tipo da movimentação' }),
  // Código do motivo (FK `motivos.codigo`). Opcional: nem todo tipo pede motivo,
  // e o motivo pode ser desativado depois — o fluxo re-filtra na hora de aplicar.
  motivo: textoOpcional(60, 'Motivo inválido'),
  termo: z
    .enum(Constants.public.Enums.termo_status, { message: 'Status de termo inválido' })
    .optional(),
  observacao: textoOpcional(500, 'Observação: no máximo 500 caracteres'),
  // Categorias ESPERADAS no lote. Informativas: viram um checklist âmbar que
  // nunca bloqueia o registro (decisão §2.5 da OS-F12).
  categorias: z
    .array(z.enum(Constants.public.Enums.categoria_ativo, { message: 'Categoria inválida' }))
    .min(1, MSG_KIT_SEM_CATEGORIA)
    .refine((cs) => new Set(cs).size === cs.length, {
      message: MSG_KIT_CATEGORIA_REPETIDA,
    }),
})

export type KitPayloadInput = z.infer<typeof kitPayloadSchema>

// ---- Catálogo (admin/kits) — espelha itemCatalogoSchema/atualizarItemSchema ----

export const kitCatalogoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do kit').max(80),
  payload: kitPayloadSchema,
})

export const atualizarKitSchema = kitCatalogoSchema.extend({
  id: z.string().uuid('Kit inválido'),
  ativo: z.boolean(),
})

// Kit nunca é excluído — só desativado (padrão do catálogo de itens; um kit
// desativado some do fluxo sem afetar nada do que já foi registrado com ele).
// A desativação passa pelo `ativo` do `atualizarKitSchema` (checkbox do dialog);
// não existe schema/action separado — ver a nota em `actions/kits.ts`.

export type KitCatalogoInput = z.infer<typeof kitCatalogoSchema>
export type AtualizarKitInput = z.infer<typeof atualizarKitSchema>

// ---- Checklist de categorias (função pura — usada pela UI do fluxo) ----

export type ItemChecklistKit = {
  categoria: CategoriaAtivo
  presente: boolean
}

/** Confronta as categorias ESPERADAS pelo kit com as que já estão no lote.
 *
 *  Devolve uma linha por categoria esperada, na ordem canônica `CATEGORIA_ORDEM`
 *  (a mesma dos selects/filtros — o checklist não pode aparecer numa ordem para
 *  cada kit). Categoria repetida na entrada vira UMA linha; categoria que está no
 *  lote mas o kit não esperava NÃO entra no checklist: o kit é uma sugestão, não
 *  um contrato — sobrar item não é erro, e o aviso é informativo (nunca bloqueia).
 *
 *  Pura de propósito: é a mesma conta do badge âmbar do passo 2 e de qualquer
 *  resumo futuro; duas cópias divergiriam. */
export function checklistCategoriasDoKit(
  esperadas: readonly CategoriaAtivo[],
  noLote: readonly CategoriaAtivo[],
): ItemChecklistKit[] {
  const querSet = new Set(esperadas)
  const temSet = new Set(noLote)
  return CATEGORIA_ORDEM.filter((c) => querSet.has(c)).map((categoria) => ({
    categoria,
    presente: temSet.has(categoria),
  }))
}

/** Faltou alguma categoria esperada? Atalho do checklist para a UI decidir se
 *  mostra o aviso âmbar (checklist inteiro presente = nada a avisar). */
export function faltaCategoriaDoKit(checklist: readonly ItemChecklistKit[]): boolean {
  return checklist.some((c) => !c.presente)
}
