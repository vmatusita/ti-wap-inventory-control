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

// Reabertura de 1..N pendências de item JÁ RESOLVIDAS (F28/PND-05) — a inversa de
// `resolverPendenciaItemSchema`, restrita ao nível administrador (a guarda de cargo
// mora na action, `exigirAdmin`; aqui é só forma). A justificativa é OBRIGATÓRIA
// (mínimo de 10 caracteres — mesma régua de `MIN_JUSTIFICATIVA`/
// `MIN_JUSTIFICATIVA_CONFLITO` já usadas nas outras ações que pedem justificativa
// no projeto, dev-destrutivo.ts e conflitos.ts): é o único texto que explica, depois
// da reabertura, por que o desfecho anterior deixou de valer — vai para a anotação
// da linha do tempo do ativo.
export const MIN_JUSTIFICATIVA_REABERTURA = 10

export const reabrirPendenciaItemSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, 'Selecione ao menos uma pendência.')
    .max(500, 'Muitas pendências de uma vez — reabra em blocos menores.'),
  justificativa: z
    .string()
    .trim()
    .min(
      MIN_JUSTIFICATIVA_REABERTURA,
      `Escreva uma justificativa de pelo menos ${MIN_JUSTIFICATIVA_REABERTURA} caracteres — ela vai para a linha do tempo do ativo.`,
    )
    .max(500, 'Justificativa: no máximo 500 caracteres'),
})

export type ReabrirPendenciaItemInput = z.infer<typeof reabrirPendenciaItemSchema>
