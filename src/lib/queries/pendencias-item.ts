import 'server-only'
import { createClient } from '@/lib/supabase/server'

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
    .select(
      'id, item, colaborador, desde, status, desfecho, observacao, resolvida_em, resolvida_por_nome',
    )
    .eq('ativo_id', ativoId)
    // 'aberta' < 'resolvida' (alfabética) → abertas primeiro; depois as resolvidas
    // mais recentes; desempate estável pela data da devolução.
    .order('status', { ascending: true })
    .order('resolvida_em', { ascending: false, nullsFirst: true })
    .order('desde', { ascending: false, nullsFirst: false })

  if (error) throw new Error(`Falha ao listar pendências de item do ativo: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    item: r.item as string,
    colaborador: r.colaborador,
    desde: r.desde,
    status: r.status as string,
    desfecho: r.desfecho,
    observacao: r.observacao,
    resolvidaEm: r.resolvida_em,
    resolvidaPorNome: r.resolvida_por_nome,
  }))
}
