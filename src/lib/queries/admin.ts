import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TipoMovimentacao } from '@/lib/dominio'

// Leituras das telas de administração (operador logado — as rotas /admin são
// gated pelo shell/middleware; as escritas revalidam nas actions).

export type UsuarioAdmin = {
  id: string
  nome: string | null
  email: string | null
  created_at: string
}

// Perfis + e-mail (que vive em auth.users). O e-mail vem do client
// administrativo (auth.admin.listUsers) — server-side apenas.
export async function listarUsuarios(): Promise<UsuarioAdmin[]> {
  const client = await createClient()
  const { data: perfis } = await client
    .from('profiles')
    .select('id, nome, created_at')
    .order('created_at', { ascending: true })

  const admin = createAdminClient()
  const emailPorId = new Map<string, string>()
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    for (const u of data?.users ?? []) {
      if (u.email) emailPorId.set(u.id, u.email)
    }
  } catch {
    // Sem service key / falha → segue sem e-mail.
  }

  return (perfis ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    email: emailPorId.get(p.id) ?? null,
    created_at: p.created_at,
  }))
}

export type FilialAdmin = {
  id: number
  slug: string
  nome: string
  ativo: boolean
  totalAtivos: number
}

export async function listarFiliaisAdmin(): Promise<FilialAdmin[]> {
  const client = await createClient()
  const [{ data: filiais }, { data: estoque }] = await Promise.all([
    client.from('filiais').select('id, slug, nome, ativo').order('nome'),
    client.from('v_estoque_atual').select('filial, total'),
  ])

  const totalPorSlug = new Map<string, number>()
  for (const e of estoque ?? []) {
    if (e.filial) totalPorSlug.set(e.filial, (totalPorSlug.get(e.filial) ?? 0) + (e.total ?? 0))
  }

  return (filiais ?? []).map((f) => ({
    id: f.id,
    slug: f.slug,
    nome: f.nome,
    ativo: f.ativo,
    totalAtivos: totalPorSlug.get(f.slug) ?? 0,
  }))
}

export type MotivoAdmin = {
  codigo: string
  rotulo: string
  aplica_a: TipoMovimentacao[]
  ativo: boolean
}

export async function listarMotivosAdmin(): Promise<MotivoAdmin[]> {
  const client = await createClient()
  const { data } = await client
    .from('motivos')
    .select('codigo, rotulo, aplica_a, ativo')
    .order('rotulo')
  return (data ?? []) as MotivoAdmin[]
}

export type SenhaAdmin = {
  id: string
  rotulo: string
  ativa: boolean
  created_at: string
  ultimo_uso: string | null
}

// NUNCA seleciona a coluna `hash` — o hash não sai do servidor (OS-F3 3.10).
// Lê pelo client ADMINISTRATIVO (service role): a partir da migration 0012 a
// tabela `senhas_acesso` não é mais legível por `authenticated` (a RLS deixava
// o hash acessível ao browser do operador via PostgREST — achado da revisão).
export async function listarSenhasAcesso(): Promise<SenhaAdmin[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('senhas_acesso')
    .select('id, rotulo, ativa, created_at, ultimo_uso')
    .order('created_at', { ascending: false })
  return (data ?? []) as SenhaAdmin[]
}
