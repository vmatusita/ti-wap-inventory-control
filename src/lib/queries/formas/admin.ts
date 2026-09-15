import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// As formas das leituras de `queries/admin.ts` (F58 · Frente C · lote 2).

export const LEITURA_MOTIVOS_ADMIN = leituraDeRelacao({
  rotulo: 'admin.motivos',
  origem: 'motivos',
  select: 'codigo, rotulo, aplica_a, ativo',
  forma: z.strictObject({
    codigo: z.string(),
    rotulo: z.string(),
    aplica_a: z.array(ENUM.tipoMovimentacao),
    ativo: z.boolean(),
  }),
  ordem: ['codigo'],
})

// NUNCA seleciona `hash` (OS-F3 3.10) — o select já declara isso, e a forma confere
// exatamente essas cinco colunas.
export const LEITURA_SENHAS_ACESSO = leituraDeRelacao({
  rotulo: 'admin.senhas-acesso',
  origem: 'senhas_acesso',
  select: 'id, rotulo, ativa, created_at, ultimo_uso',
  forma: z.strictObject({
    id: z.string(),
    rotulo: z.string(),
    ativa: z.boolean(),
    created_at: z.string(),
    ultimo_uso: z.string().nullable(),
  }),
  ordem: ['id'],
})
