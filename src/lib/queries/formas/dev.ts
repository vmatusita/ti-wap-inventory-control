import 'server-only'
import { z } from 'zod'
import { reciboDeRpc } from '@/lib/supabase/leitura'

// A forma do retorno de `dev_checagens_integridade` (F58 · Frente C · lote 2).
//
// RECIBO, não leitura de conferidor: a conta de PRODUÇÃO que o conferidor de formas usa é
// `admin`, e a RPC recusa quem não é `dev` (`if not public.e_dev() then raise …`, migration
// 0138) — o conferidor nunca vai poder chamá-la. A forma é provada contra o CORPO VIVO
// (`scripts/db/corpo-vigente.mjs`, migration 0138 §1 `checagens_integridade_nucleo`): as doze
// peças devolvem `chave` (literal `'…'::text`), `total` (`count(*)::bigint`) e `amostra`
// (`coalesce((array_agg(…))[1:5], array[]::text[])`) — as três SEMPRE não-nulas, mesmo grupo
// vazio. Bate exatamente com o tipo gerado (`Returns: { amostra: string[]; chave: string;
// total: number }[]`, sem entrada em `COLUNAS_DE_RETORNO_ANULAVEIS`).
export const LEITURA_CHECAGENS_INTEGRIDADE = reciboDeRpc({
  rotulo: 'dev.checagens-integridade',
  rpc: 'dev_checagens_integridade',
  forma: z.strictObject({
    chave: z.string(),
    total: z.number(),
    amostra: z.array(z.string()),
  }),
})
