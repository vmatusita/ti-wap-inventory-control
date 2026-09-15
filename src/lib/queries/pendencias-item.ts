import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { linhasDe } from '@/lib/supabase/linhas'
import { LEITURA_PENDENCIAS_ITEM_DO_ATIVO } from '@/lib/queries/formas/pendencias-item'

// Pendências de item de UM ativo, para a ficha (F18 §B3): abertas em destaque,
// resolvidas como auditoria (desfecho/quem/quando). A resolvida NÃO some da ficha —
// só sai da fila. Roda sob o client do operador (RLS); a ficha é rota de operador.

export type PendenciaItemFicha = {
  id: string
  item: string
  colaborador: string | null
  desde: string | null // data da devolução geradora (timestamptz)
  status: string // 'aberta' | 'resolvida'
  desfecho: string | null // 'recuperado' | 'baixa' | null
  observacao: string | null
  resolvidaEm: string | null
  resolvidaPorNome: string | null
}

export async function listarPendenciasItemDoAtivo(
  ativoId: string,
): Promise<PendenciaItemFicha[]> {
  const client = await createClient()
  const { data, error } = await client
    .from('v_pendencias_item')
    .select(LEITURA_PENDENCIAS_ITEM_DO_ATIVO.select)
    .eq('ativo_id', ativoId)
    // 'aberta' < 'resolvida' (alfabética) → abertas primeiro; depois as resolvidas
    // mais recentes; desempate estável pela data da devolução.
    .order('status', { ascending: true })
    .order('resolvida_em', { ascending: false, nullsFirst: true })
    .order('desde', { ascending: false, nullsFirst: false })

  if (error) throw new Error(`Falha ao listar pendências de item do ativo: ${error.message}`)

  return linhasDe(data, LEITURA_PENDENCIAS_ITEM_DO_ATIVO.forma, LEITURA_PENDENCIAS_ITEM_DO_ATIVO.rotulo).map((r) => ({
    id: r.id,
    item: r.item,
    colaborador: r.colaborador,
    desde: r.desde,
    status: r.status,
    desfecho: r.desfecho,
    observacao: r.observacao,
    resolvidaEm: r.resolvida_em,
    resolvidaPorNome: r.resolvida_por_nome,
  }))
}
