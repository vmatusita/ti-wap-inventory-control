import { createClient } from '@/lib/supabase/server'

export type Filial = { id: number; slug: string; nome: string }

// Filiais ativas, ordenadas por nome. Usadas em filtros e no destino de
// transferencia. Leitura via cliente server (respeita RLS do operador).
export async function listarFiliais(): Promise<Filial[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('filiais')
    .select('id, slug, nome')
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw new Error(`Falha ao listar filiais: ${error.message}`)
  return data ?? []
}
