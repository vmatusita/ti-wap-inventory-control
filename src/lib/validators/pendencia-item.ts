import { z } from 'zod'
import { DESFECHOS_PENDENCIA_ITEM } from '@/lib/dominio'

// Resolução de 1..N pendências de item numa tacada (F18 §B2) — o caminho para
// zerar a fila herdada com UMA justificativa. `ids` são os pendencia_item_id
// (uuids). `observacao` é opcional; '' vira undefined (não grava string vazia).
// Cap defensivo de 500 ids por chamada (a resolução em lote da tela nunca chega
// perto — a página lista no máximo 30 por vez).
export const resolverPendenciaItemSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, 'Selecione ao menos uma pendência.')
    .max(500, 'Muitas pendências de uma vez — resolva em blocos menores.'),
  desfecho: z.enum(DESFECHOS_PENDENCIA_ITEM),
  observacao: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().trim().max(500, 'Observação: no máximo 500 caracteres').optional(),
  ),
})

export type ResolverPendenciaItemInput = z.infer<typeof resolverPendenciaItemSchema>
