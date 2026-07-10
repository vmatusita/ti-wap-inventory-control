import { createClient } from '@/lib/supabase/server'
import type {
  StatusAtivo,
  TermoStatus,
  TipoMovimentacao,
} from '@/lib/dominio'

// Estado do ativo ANTES da movimentacao (usado no dialog de estorno — o ativo
// volta a este estado). Gravado pelo trigger em `snapshot_anterior` (jsonb).
export type SnapshotAnterior = {
  status: StatusAtivo | null
  colaborador: string | null
  setor: string | null
  filial_id: number | null
}

// Uma linha da LINHA DO TEMPO da ficha (OS-F2 3.2.3), mais recente no topo.
export type MovimentacaoTimeline = {
  id: string
  tipo: TipoMovimentacao
  motivo: string | null
  data: string
  colaborador: string | null
  setor: string | null
  chamado: string | null
  status_anterior: StatusAtivo | null
  status_resultante: StatusAtivo | null
  itens_faltantes: string[] | null
  observacao: string | null
  estorno_de: string | null
  snapshot_anterior: SnapshotAnterior | null
  created_at: string
  autor_nome: string | null
  filial_origem_nome: string | null
  filial_destino_nome: string | null
}

type AutorEmbed = { nome: string | null } | null
type FilialEmbed = { nome: string } | null

// O select usa hints de FK (`!fkname`) e aliases de embed; o type-checker do
// supabase-js nao infere esse formato, entao tipamos a linha crua e fazemos o
// cast explicito. Os nomes de coluna sao verificados em runtime pelo banco.
type RawTimelineRow = {
  id: string
  tipo: MovimentacaoTimeline['tipo']
  motivo: string | null
  data: string
  colaborador: string | null
  setor: string | null
  chamado: string | null
  status_anterior: StatusAtivo | null
  status_resultante: StatusAtivo | null
  itens_faltantes: string[] | null
  observacao: string | null
  estorno_de: string | null
  snapshot_anterior: SnapshotAnterior | null
  created_at: string
  autor: AutorEmbed
  origem: FilialEmbed
  destino: FilialEmbed
}

const TIMELINE_SELECT =
  'id, tipo, motivo, data, colaborador, setor, chamado, status_anterior, status_resultante, itens_faltantes, observacao, estorno_de, snapshot_anterior, created_at, ' +
  'autor:profiles!movimentacoes_criado_por_fkey(nome), ' +
  'origem:filiais!movimentacoes_filial_id_fkey(nome), ' +
  'destino:filiais!movimentacoes_filial_destino_id_fkey(nome)'

// Linha do tempo do ativo. Ordenada por created_at desc (empate: pela data).
// created_at e monotonico por ativo em producao (cada mov e uma transacao).
export async function listarMovimentacoesDoAtivo(
  ativoId: string,
): Promise<MovimentacaoTimeline[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(TIMELINE_SELECT)
    .eq('ativo_id', ativoId)
    .order('created_at', { ascending: false })
    .order('data', { ascending: false })

  if (error)
    throw new Error(`Falha ao carregar a linha do tempo: ${error.message}`)

  const rows = (data ?? []) as unknown as RawTimelineRow[]
  return rows.map((r) => {
    const autor = r.autor
    const origem = r.origem
    const destino = r.destino
    return {
      id: r.id,
      tipo: r.tipo,
      motivo: r.motivo,
      data: r.data,
      colaborador: r.colaborador,
      setor: r.setor,
      chamado: r.chamado,
      status_anterior: r.status_anterior,
      status_resultante: r.status_resultante,
      itens_faltantes: r.itens_faltantes,
      observacao: r.observacao,
      estorno_de: r.estorno_de,
      snapshot_anterior: (r.snapshot_anterior as SnapshotAnterior | null) ?? null,
      created_at: r.created_at,
      autor_nome: autor?.nome ?? null,
      filial_origem_nome: origem?.nome ?? null,
      filial_destino_nome: destino?.nome ?? null,
    }
  })
}

// "Repetir ultima" (OS-F2 3.7.3): pre-preenche tipo/motivo/colaborador/setor/
// chamado/termo da ultima movimentacao registrada pelo usuario logado (menos o
// ativo). Estorno nao entra — nao ha o que repetir.
export type UltimaMovimentacaoUsuario = {
  tipo: TipoMovimentacao
  motivo: string | null
  colaborador: string | null
  setor: string | null
  chamado: string | null
  termo_assinado: TermoStatus | null
  termo_data: string | null
}

export async function ultimaMovimentacaoDoUsuario(
  userId: string,
): Promise<UltimaMovimentacaoUsuario | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select('tipo, motivo, colaborador, setor, chamado, termo_assinado, termo_data')
    .eq('criado_por', userId)
    .neq('tipo', 'estorno')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return (data as UltimaMovimentacaoUsuario | null) ?? null
}

// "Duplicar" (OS-F2 3.7.4): abre /movimentacoes/nova pre-preenchida com aquela
// movimentacao (permitindo trocar o ativo).
export type MovimentacaoParaDuplicar = {
  ativo_id: string
  tipo: TipoMovimentacao
  motivo: string | null
  colaborador: string | null
  setor: string | null
  chamado: string | null
  termo_assinado: TermoStatus | null
  termo_data: string | null
  observacao: string | null
  filial_destino_id: number | null
  itens_faltantes: string[] | null
}

export async function buscarMovimentacaoParaDuplicar(
  id: string,
): Promise<MovimentacaoParaDuplicar | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(
      'ativo_id, tipo, motivo, colaborador, setor, chamado, termo_assinado, termo_data, observacao, filial_destino_id, itens_faltantes',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao carregar movimentação: ${error.message}`)
  return (data as MovimentacaoParaDuplicar | null) ?? null
}
