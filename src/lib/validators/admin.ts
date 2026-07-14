import { z } from 'zod'
import { Constants } from '@/lib/types/database'

// Schemas de administração (convites, filiais, motivos) — antes definidos inline
// em actions/admin.ts. Espelham as regras de negócio da spec §3/§6.

// ---- Convite de operador (só @wap.ind.br — validação client E server) ----
const DOMINIO = '@wap.ind.br'
export const conviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .refine((e) => e.endsWith(DOMINIO), `O e-mail precisa terminar com ${DOMINIO}`),
})

// ---- Filiais ----
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const filialSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, 'Slug: só letras minúsculas, números e hífens'),
})

export const atualizarFilialSchema = filialSchema.extend({
  id: z.number().int().positive(),
  ativo: z.boolean(),
})

// ---- Motivos ----
const tiposMov = Constants.public.Enums.tipo_movimentacao
export const motivoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/, 'Código: só letras minúsculas, números e _')
    .max(40),
  rotulo: z.string().trim().min(2, 'Informe o rótulo').max(80),
  aplica_a: z.array(z.enum(tiposMov)).min(1, 'Escolha ao menos um tipo'),
})

export const atualizarMotivoSchema = z.object({
  codigo: z.string().trim().min(1),
  rotulo: z.string().trim().min(2, 'Informe o rótulo').max(80),
  aplica_a: z.array(z.enum(tiposMov)).min(1, 'Escolha ao menos um tipo'),
  ativo: z.boolean(),
})
