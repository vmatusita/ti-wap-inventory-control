import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { TermoTipo } from '@/lib/termos/tipos'
import type { CamposTermo } from '@/lib/validators/termo'

// Um termo já gerado, para o histórico na ficha do ativo (F5A §5).
export type TermoGerado = {
  id: string
  tipo: TermoTipo
  colaborador: string | null
  arquivo_path: string
  dados: CamposTermo & { data?: string }
  movimentacao_ids: string[]
  ativo_ids: string[]
  created_at: string
  atualizado_em: string
  gerado_por_nome: string | null
}

const SELECT =
  'id, tipo, colaborador, arquivo_path, dados, movimentacao_ids, ativo_ids, created_at, atualizado_em, ' +
  'autor:profiles!termos_gerados_gerado_por_fkey(nome)'

type Row = {
  id: string
  tipo: TermoTipo
  colaborador: string | null
  arquivo_path: string
  dados: CamposTermo & { data?: string }
  movimentacao_ids: string[]
  ativo_ids: string[]
  created_at: string
  atualizado_em: string
  autor: { nome: string | null } | null
}

function mapRow(r: Row): TermoGerado {
  return {
    id: r.id,
    tipo: r.tipo,
    colaborador: r.colaborador,
    arquivo_path: r.arquivo_path,
    dados: r.dados,
    movimentacao_ids: r.movimentacao_ids,
    ativo_ids: r.ativo_ids,
    created_at: r.created_at,
    atualizado_em: r.atualizado_em,
    gerado_por_nome: r.autor?.nome ?? null,
  }
}

// Termos que incluem este ativo (responsabilidade dele ou devolução em lote que o
// contém). Mais recente no topo.
export async function listarTermosDoAtivo(ativoId: string): Promise<TermoGerado[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('termos_gerados')
    .select(SELECT)
    .contains('ativo_ids', [ativoId])
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Falha ao carregar termos: ${error.message}`)
  return ((data ?? []) as unknown as Row[]).map(mapRow)
}
