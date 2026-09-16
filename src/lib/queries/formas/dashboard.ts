import 'server-only'
import { z } from 'zod'
import { naoNulaNaView } from '@/lib/supabase/colunas-de-view'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, leituraDeRpc } from '@/lib/supabase/leitura'

// As formas das leituras do dashboard (`app/(app)/page.tsx`).
//
// O card de Pendências (F58 · Frente C · lote 3):
//
// `v_fila_pendencias` é VIEW: `id`/`ordem` o SQL garante não-nulos (`colunas-de-view.ts`, já
// declarados no mapa pelo lote 2) — os demais continuam anuláveis, como a view os entrega. O
// select é um RECORTE menor do que `LEITURA_FILA_PENDENCIAS` (pendencias-detalhe.ts): o card do
// dashboard só mostra as 5 mais antigas, sem os campos de detalhe da mesa de pendências.

const s = z.string()
const sn = z.string().nullable()
const n = z.number()

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

// ---------------------------------------------------------------------------
// F60 · Frente B — os KPIs (RPC rel_contagem_status_filiais, 0141)
// ---------------------------------------------------------------------------
// Uma linha por status PRESENTE no recorte — inclusive as duas baixas, que `kpisDeContagens` tira
// na conta (a regra do KPI mora em TypeScript). `status` e `total` saem não-nulos: `ativos.status`
// é NOT NULL e `count(*)` nunca é NULL, então nenhuma entrada em `COLUNAS_DE_RETORNO_ANULAVEIS`.
// A chamada mora em `queries/dashboard.ts`, que NÃO aceita client — fora da superfície do
// visualizador por senha, e por isso fora da lista branca de RPCs dele.

export const LEITURA_REL_CONTAGEM_STATUS = leituraDeRpc({
  rotulo: 'dashboard.rel-contagem-status',
  rpc: 'rel_contagem_status_filiais',
  forma: z.strictObject({ status: ENUM.statusAtivo, total: n }),
  retorno: 'linhas',
  // o consolidado (a lista de TODAS as filiais, com desativada) + uma célula por filial ativa
  matriz: { tipo: 'filiais', filiais: 'p_filiais' },
  // uma linha por status: `group by a.status` (0141)
  ordem: ['status'],
})
