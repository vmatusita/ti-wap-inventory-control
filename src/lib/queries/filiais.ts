import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'

// `cidade` (F25, migration 0102) é a cidade que assina o TERMO — entra na linha
// "{cidade}, {data por extenso}" dos 7 modelos. `''` = ainda não cadastrada, e
// quem trata esse caso é `prepararTermo`, avisando em vez de gerar um documento
// que começa por vírgula.
export type Filial = { id: number; slug: string; nome: string; cidade: string }

// Filiais ativas, ordenadas por nome. Usadas em filtros e no destino de
// transferencia. Aceita um client resolvido: o operador usa o client com RLS
// (default), mas a SESSÃO POR SENHA precisa passar o client administrativo —
// senão a RLS (anon = nada) devolve lista vazia e as tabs/filtro de filial
// somem para o visualizador (achado da revisão da F3).
export async function listarFiliais(
  client?: SupabaseClient<Database>,
): Promise<Filial[]> {
  const supabase = client ?? (await createClient())
  const { data, error } = await supabase
    .from('filiais')
    .select('id, slug, nome, cidade')
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error) throw new Error(`Falha ao listar filiais: ${error.message}`)
  return data ?? []
}
