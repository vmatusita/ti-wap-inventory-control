import { createClient } from '@/lib/supabase/server'
import { type Tables } from '@/lib/types/database'

export type Perfil = Pick<Tables<'profiles'>, 'id' | 'nome' | 'role'>

// Perfil do usuario logado (nome + papel), lido de public.profiles.
// Retorna null quando nao ha sessao.
export async function getPerfilAtual(): Promise<Perfil | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, nome, role')
    .eq('id', user.id)
    .single()

  // Se o perfil ainda nao foi criado, degrada para viewer com o e-mail.
  if (!data) {
    return { id: user.id, nome: user.email ?? null, role: 'viewer' }
  }

  return data
}
