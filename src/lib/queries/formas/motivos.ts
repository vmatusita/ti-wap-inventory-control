import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// A forma da leitura de `queries/motivos.ts` (F58 · Frente C · lote 2).

export const LEITURA_MOTIVOS_ATIVOS = leituraDeRelacao({
  rotulo: 'motivos.listar',
  origem: 'motivos',
  select: 'codigo, rotulo, aplica_a',
  forma: z.strictObject({
    codigo: z.string(),
    rotulo: z.string(),
    aplica_a: z.array(ENUM.tipoMovimentacao),
  }),
  ordem: ['codigo'],
})
