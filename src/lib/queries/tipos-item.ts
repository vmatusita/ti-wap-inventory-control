import { createClient } from '@/lib/supabase/server'

// Leituras do catálogo de TIPOS de item (F37 · D7). Rota só do operador — client do
// servidor com a sessão dele (RLS `authenticated`), como o resto de src/lib/queries.

export type TipoItem = {
  id: number
  slug: string
  rotulo: string
  ativo: boolean
  ordem: number
}

export type TipoItemAdmin = TipoItem & {
  /** Quantos itens do catálogo apontam para este tipo. Decide "desativar × usar". */
  itens: number
}

/** Tipos ATIVOS, na ordem de exibição — para o select da ficha do item. */
export async function listarTiposItemAtivos(): Promise<TipoItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tipos_item')
    .select('id, slug, rotulo, ativo, ordem')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('rotulo', { ascending: true })
  if (error) throw new Error(`Falha ao listar tipos de item: ${error.message}`)
  return (data ?? []) as TipoItem[]
}

/** Catálogo inteiro (ativos e inativos) + quantos itens usam cada tipo. */
export async function listarTiposItemAdmin(): Promise<TipoItemAdmin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tipos_item')
    .select('id, slug, rotulo, ativo, ordem, itens(count)')
    .order('ordem', { ascending: true })
    .order('rotulo', { ascending: true })
  if (error) throw new Error(`Falha ao listar tipos de item: ${error.message}`)
  type Row = TipoItem & { itens: { count: number }[] }
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    rotulo: r.rotulo,
    ativo: r.ativo,
    ordem: r.ordem,
    itens: r.itens?.[0]?.count ?? 0,
  }))
}
