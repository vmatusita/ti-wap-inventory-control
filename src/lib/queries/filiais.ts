import 'server-only'
import { cache } from 'react'
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
// MEMOIZADA POR REQUISIÇÃO (`cache()` do React), como `getOperador()`. A F25 fez o
// LAYOUT do grupo (app) precisar da lista — é dela que sai a aba padrão de
// /relatorios do operador (slug + ordem alfabética de nome) —, e sem o memo toda
// rota do app pagaria um select a mais, já que as páginas também a chamam.
//
// ⚠ O cache é POR REQUISIÇÃO, nunca global (mesma nota de `getOperador`): esta
// lista não é segredo, mas `"use cache"`/`unstable_cache` guardariam entre
// requisições e uma filial recém-desativada continuaria aparecendo.
//
// A chave do memo é o ARGUMENTO: quem passa o client administrativo (a sessão por
// SENHA) tem entrada própria e não compartilha resultado com a sessão com RLS —
// que é exatamente o desejado, porque as duas enxergam coisas diferentes.
export const listarFiliais = cache(async function listarFiliais(
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
})
