import 'server-only'
import { z } from 'zod'
import { reciboDeRpc } from '@/lib/supabase/leitura'

// O RECIBO de `devolver_ao_fornecedor` (`actions/devolucao-fornecedor.ts::devolverAoFornecedor`,
// F58 · Frente C · lote 3).
//
// `returns table (mov_id uuid, substituto_id uuid, substituto_mov_id uuid)` — ESTRITO com
// EXATAMENTE as três colunas (migration 0047, corpo vigente). `substituto_id`/`substituto_mov_id`
// já estão em `COLUNAS_DE_RETORNO_ANULAVEIS` (`rpc.ts`): sem substituto elas nunca são atribuídas
// — o caminho NORMAL de "devolver sem troca". A porta (`chamarRpc`) já alarga essas duas para
// `| null`; a forma aqui só confere em runtime o que o tipo já afirma.

export const LEITURA_DEVOLVER_AO_FORNECEDOR = reciboDeRpc({
  rotulo: 'devolucao-fornecedor.retorno',
  rpc: 'devolver_ao_fornecedor',
  forma: z.strictObject({
    mov_id: z.string(),
    substituto_id: z.string().nullable(),
    substituto_mov_id: z.string().nullable(),
  }),
})
