import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// As FORMAS das leituras de `queries/movimentacoes.ts` (F58 · Frente C).

const s = z.string()
const sn = z.string().nullable()

/**
 * O retrato do ativo ANTES da movimentação (`movimentacoes.snapshot_anterior`, jsonb gravado pelo
 * trigger). FROUXO: é coluna `jsonb` de dado histórico — um retrato gravado por uma versão antiga do
 * trigger pode não ter uma das chaves, ou ter outras. Cada chave é opcional e anulável; quem lê
 * normaliza a ausência para `null`, que é o que a tela do estorno sempre tratou.
 */
export const FORMA_SNAPSHOT_ANTERIOR = z.looseObject({
  status: ENUM.statusAtivo.nullable().optional(),
  colaborador: sn.optional(),
  setor: sn.optional(),
  filial_id: z.number().nullable().optional(),
})

/**
 * A linha do tempo da ficha do ativo. Até a F58 o `select` era montado por `+`, a inferência do
 * supabase-js caía, e a linha era tipada à mão (`RawTimelineRow`) com um cast no `jsonb` — com a
 * justificativa, falsa, de que o supabase-js não inferia os hints de FK. Ele infere, quando o texto
 * é LITERAL.
 */
export const LEITURA_LINHA_DO_TEMPO = leituraDeRelacao({
  rotulo: 'movimentacoes.linha-do-tempo',
  origem: 'movimentacoes',
  select:
    'id, tipo, motivo, data, colaborador, setor, chamado, chamado_fornecedor, status_anterior, status_resultante, itens_faltantes, observacao, estorno_de, snapshot_anterior, created_at, forcado, autor:profiles!movimentacoes_criado_por_fkey(nome), origem:filiais!movimentacoes_filial_id_fkey(nome), destino:filiais!movimentacoes_filial_destino_id_fkey(nome)',
  forma: z.strictObject({
    id: s,
    tipo: ENUM.tipoMovimentacao,
    motivo: sn,
    data: s,
    colaborador: sn,
    setor: sn,
    chamado: sn,
    chamado_fornecedor: sn,
    status_anterior: ENUM.statusAtivo.nullable(),
    status_resultante: ENUM.statusAtivo.nullable(),
    itens_faltantes: z.array(s).nullable(),
    observacao: sn,
    estorno_de: sn,
    snapshot_anterior: FORMA_SNAPSHOT_ANTERIOR.nullable(),
    created_at: s,
    forcado: z.boolean(),
    autor: z.strictObject({ nome: sn }),
    origem: z.strictObject({ nome: s }),
    destino: z.strictObject({ nome: s }).nullable(),
  }),
  ordem: ['id'],
})
