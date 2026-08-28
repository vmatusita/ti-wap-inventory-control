import { z } from 'zod'

// Schemas do catálogo de TIPOS de item (F37 · D7), no mesmo idioma de `item.ts` e
// `admin.ts`: a mensagem pt-BR mora aqui e já é a mensagem da tela.
//
// ⚠ Por que NÃO se usa `z.enum(Constants.public.Enums…)` como o `grupo` de
// `itemCatalogoSchema` faz: `tipos_item` é uma TABELA, não um enum do Postgres. O
// conjunto de valores muda em tempo de operação (o admin cria um tipo novo), então o
// que se valida aqui é o FORMATO do slug, não a pertinência a uma lista fechada de
// compilação — quem garante a pertinência é a FK de `itens.tipo_id`.

/**
 * O formato do slug, espelho do CHECK `tipos_item_slug_formato` da migration 0114:
 * começa por letra minúscula, segue com minúscula/dígito/underscore, 2 a 30 no total.
 * Sem acento e sem maiúscula porque é ISSO que o histórico guarda em
 * `movimentacoes.itens_faltantes` e `pendencias_item.item`.
 */
export const SLUG_TIPO_RE = /^[a-z][a-z0-9_]{1,29}$/

export const tipoItemSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      SLUG_TIPO_RE,
      'Código: minúsculas sem acento, começando por letra (ex.: fone_bluetooth), de 2 a 30 caracteres',
    ),
  rotulo: z
    .string()
    .trim()
    .min(2, 'Informe o nome que aparece na tela')
    .max(60, 'Nome: no máximo 60 caracteres'),
  // OPCIONAL, não `.default(0)`. A diferença importa: a action decide a ordem
  // automática ("10 acima da maior") quando o admin NÃO informa nada, e `0` é um
  // valor legítimo — é o topo da lista. Com `.default(0)` os dois casos chegavam
  // indistinguíveis, e o `if (!ordem)` da action descartava em silêncio o zero que
  // alguém digitou de propósito (revisão de 28/08/2026).
  ordem: z.coerce.number().int('Ordem inteira').min(0).max(999).optional(),
})

/**
 * Edição: o SLUG **não entra**. Slug gravado nunca muda — é a promessa que mantém
 * legível todo registro histórico que o cita. Rótulo, ordem e o liga/desliga, sim.
 *
 * Aqui a `ordem` é OBRIGATÓRIA, ao contrário da criação: editar sem mandar ordem
 * nenhuma não tem leitura possível ("mantém a atual" é a tela que resolve, mandando
 * a atual), e um `.default(0)` faria o campo apagado jogar o tipo para o topo.
 */
export const atualizarTipoItemSchema = tipoItemSchema.omit({ slug: true }).extend({
  id: z.coerce.number().int().positive(),
  ativo: z.boolean(),
  ordem: z.coerce.number().int('Ordem inteira').min(0).max(999),
})

/** Escolha do tipo na ficha do item: `null` é resposta válida (nasce sem tipo). */
export const tipoDoItemSchema = z.object({
  item_id: z.coerce.number().int().positive(),
  tipo_id: z.coerce.number().int().positive().nullable(),
})

export type TipoItemInput = z.infer<typeof tipoItemSchema>

export const MSG_TIPO_DUPLICADO =
  'Já existe um tipo com esse código. Use outro código — ou reative o que já existe, se ele estiver desativado.'

/** Próxima `ordem`: 10 acima da maior (deixa espaço para encaixar entre duas). */
export function proximaOrdemDeTipo(maiorOrdem: number | null | undefined): number {
  if (maiorOrdem == null || !Number.isFinite(maiorOrdem)) return 0
  return Math.min(999, Math.max(0, Math.trunc(maiorOrdem) + 10))
}

/**
 * Sugere um código a partir do nome digitado — "Fone de ouvido" → `fone_de_ouvido`.
 * É conveniência de tela: o admin pode sobrescrever, e o schema é quem valida.
 * A normalização é a mesma família da chave de colaborador (sem acento, minúsculas),
 * mas aqui o separador é `_`, porque é isso que o CHECK do banco aceita.
 */
export function sugerirSlug(rotulo: string): string {
  return rotulo
    .normalize('NFD')
    // `\p{Diacritic}` em vez da faixa literal U+0300–U+036F: a fonte fica em ASCII
    // puro, que nenhuma normalização de arquivo consegue estragar sem se notar.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '') // o CHECK exige começar por LETRA
    .replace(/_+$/, '')
    .slice(0, 30)
    .replace(/_+$/, '')
}
