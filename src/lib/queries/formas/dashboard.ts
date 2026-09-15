import 'server-only'
import { z } from 'zod'
import { naoNulaNaView } from '@/lib/supabase/colunas-de-view'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// A forma da leitura do card de Pendências do dashboard (F58 · Frente C · lote 3).
//
// `v_fila_pendencias` é VIEW: `id`/`ordem` o SQL garante não-nulos (`colunas-de-view.ts`, já
// declarados no mapa pelo lote 2) — os demais continuam anuláveis, como a view os entrega. O
// select é um RECORTE menor do que `LEITURA_FILA_PENDENCIAS` (pendencias-detalhe.ts): o card do
// dashboard só mostra as 5 mais antigas, sem os campos de detalhe da mesa de pendências.

const s = z.string()
const sn = z.string().nullable()

export const LEITURA_FILA_PENDENCIAS_DASHBOARD = leituraDeRelacao({
  rotulo: 'dashboard.fila-pendencias',
  origem: 'v_fila_pendencias',
  select: 'id, ordem, patrimonio, categoria, filial, pendencia',
  forma: z.strictObject({
    id: naoNulaNaView('v_fila_pendencias', 'id', s),
    ordem: naoNulaNaView('v_fila_pendencias', 'ordem', s),
    patrimonio: sn,
    categoria: ENUM.categoriaAtivo.nullable(),
    filial: sn,
    pendencia: sn,
  }),
  ordem: ['ordem'],
})
