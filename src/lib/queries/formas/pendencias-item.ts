import 'server-only'
import { z } from 'zod'
import { naoNulaNaView } from '@/lib/supabase/colunas-de-view'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// A forma da leitura de pendências de item de UM ativo (F58 · Frente C · lote 2).
//
// `v_pendencias_item` é VIEW: o gerador tipa toda coluna como anulável. `id`, `item` e `status`
// o SQL garante não-nulos (ver `colunas-de-view.ts`); as demais continuam anuláveis.

const sn = z.string().nullable()

export const LEITURA_PENDENCIAS_ITEM_DO_ATIVO = leituraDeRelacao({
  rotulo: 'pendencias-item.do-ativo',
  origem: 'v_pendencias_item',
  select: 'id, item, colaborador, desde, status, desfecho, observacao, resolvida_em, resolvida_por_nome',
  forma: z.strictObject({
    id: naoNulaNaView('v_pendencias_item', 'id', z.string()),
    item: naoNulaNaView('v_pendencias_item', 'item', z.string()),
    colaborador: sn,
    desde: sn,
    status: naoNulaNaView('v_pendencias_item', 'status', z.string()),
    desfecho: sn,
    observacao: sn,
    resolvida_em: sn,
    resolvida_por_nome: sn,
  }),
  ordem: ['id'],
})
