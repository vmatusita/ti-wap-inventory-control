import 'server-only'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerSessaoView, VIEW_COOKIE_NAME } from '@/lib/auth/senha-sessao'
import type { Database } from '@/lib/types/database'

export type DbClient = SupabaseClient<Database>

export type Operador = { id: string; nome: string }

// Operador logado (Supabase Auth). null quando não há sessão de operador.
export async function getOperador(): Promise<Operador | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('nome')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    nome: data?.nome?.trim() || user.email || 'Operador',
  }
}

export type ViewerSession = { senhaId: string; rotulo: string }

// Sessão de VISUALIZAÇÃO por senha. Faz a verificação REAL a cada request:
// assinatura do cookie (lerSessaoView) + senha ainda ATIVA no banco (client
// administrativo). Retorna null se o cookie for inválido/expirado OU a senha
// tiver sido revogada — é o que mata o acesso no request seguinte (OS-F3 3.9.3).
export async function getViewerSession(): Promise<ViewerSession | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(VIEW_COOKIE_NAME)?.value
  const sess = lerSessaoView(raw)
  if (!sess) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('senhas_acesso')
    .select('id, rotulo, ativa')
    .eq('id', sess.senhaId)
    .maybeSingle()

  if (!data || !data.ativa) return null
  return { senhaId: data.id, rotulo: data.rotulo }
}

// Acesso resolvido às rotas de relatório: operador (client com RLS) ou
// visualizador por senha (client administrativo — servido pelo servidor). As
// queries de relatório recebem o `client` e o `modo` decide o chrome/atualização.
export type AcessoRelatorio =
  | { modo: 'operador'; client: DbClient; operador: Operador }
  | { modo: 'viewer'; client: DbClient; rotulo: string }

export async function resolverAcessoRelatorio(): Promise<AcessoRelatorio | null> {
  const operador = await getOperador()
  if (operador) {
    return { modo: 'operador', client: await createClient(), operador }
  }
  const viewer = await getViewerSession()
  if (viewer) {
    return { modo: 'viewer', client: createAdminClient(), rotulo: viewer.rotulo }
  }
  return null
}
