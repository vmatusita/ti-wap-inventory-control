'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { type ActionResult } from '@/lib/actions/erros'
import { criarSenhaSchema } from '@/lib/validators/senha'
import {
  assinarSessaoView,
  hashSenha,
  verificarSenha,
  VIEW_COOKIE_NAME,
  VIEW_MAX_AGE_SEG,
} from '@/lib/auth/senha-sessao'
import { revalidatePath } from 'next/cache'

// Acesso por senha aos relatórios (spec §3 / OS-F3 3.9). Toda a validação roda
// no servidor com o client administrativo — nunca a anon key, nunca o browser.

// ---- Rate-limit por IP (OS-F3 3.9.1) ----
// O contador é PERSISTENTE no Postgres (função registrar_tentativa_senha, migration
// 0025): compartilhado entre instâncias da Vercel e atômico. O Map em memória antigo
// era por-processo e sumia no cold start — best-effort demais contra brute force.
function ipCliente(h: Headers): string {
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'desconhecido'
}

// Destino pós-login (OS-F3 melhoria): leva o gestor direto ao relatório clicado.
// Só caminhos INTERNOS de relatório entram — bloqueia URL absoluta, protocolo-
// relativo, backslash, traversal, o próprio /acesso (loop) e quebra de linha
// (CRLF em header). Qualquer coisa fora disso cai no consolidado ao vivo.
function destinoRelatorio(next: FormDataEntryValue | null): string {
  const padrao = '/relatorios/geral'
  if (typeof next !== 'string' || next.length === 0) return padrao
  if (!next.startsWith('/relatorios/')) return padrao
  if (next.startsWith('/relatorios/acesso')) return padrao
  if (next.includes('..') || next.includes('\\') || next.includes('//')) return padrao
  if (next.includes('\n') || next.includes('\r')) return padrao
  return next
}

// ---- Entrar por senha (público) ----

export type EntrarState = { erro?: string }

export async function entrarComSenha(
  _prev: EntrarState,
  formData: FormData,
): Promise<EntrarState> {
  const h = await headers()
  const admin = createAdminClient()

  // Rate-limit PERSISTENTE (§3.9.1): contador atômico no Postgres, compartilhado
  // entre instâncias. Falha ABERTO se a RPC der erro — a senha é a barreira real,
  // não travamos o acesso por um hiccup de infra.
  const { data: excedeu } = await admin.rpc('registrar_tentativa_senha', {
    p_ip: ipCliente(h),
  })
  if (excedeu) {
    return { erro: 'Muitas tentativas. Aguarde um instante e tente de novo.' }
  }

  const senha = String(formData.get('senha') ?? '')
  if (senha.length < 1) {
    return { erro: 'Senha inválida.' }
  }

  const { data: ativas } = await admin
    .from('senhas_acesso')
    .select('id, hash')
    .eq('ativa', true)

  let senhaId: string | null = null
  for (const s of ativas ?? []) {
    if (await verificarSenha(senha, s.hash)) {
      senhaId = s.id
      break
    }
  }

  // Erro SEMPRE genérico — nunca revela se a senha existe/foi revogada (3.9.1).
  if (!senhaId) {
    return { erro: 'Senha inválida.' }
  }

  await admin
    .from('senhas_acesso')
    .update({ ultimo_uso: new Date().toISOString() })
    .eq('id', senhaId)

  const { value } = assinarSessaoView(senhaId)
  const cookieStore = await cookies()
  cookieStore.set(VIEW_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/relatorios',
    maxAge: VIEW_MAX_AGE_SEG,
  })

  redirect(destinoRelatorio(formData.get('next')))
}

// ---- Sair da visualização (apaga o cookie) ----
export async function sairVisualizacao() {
  const cookieStore = await cookies()
  cookieStore.set(VIEW_COOKIE_NAME, '', { path: '/relatorios', maxAge: 0 })
  redirect('/relatorios/acesso')
}

// ---- Gestão das senhas (admin) ----
export async function criarSenhaAcesso(input: {
  rotulo: string
  senha: string
}): Promise<ActionResult> {
  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const parsed = criarSenhaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const admin = createAdminClient()
  const hash = await hashSenha(parsed.data.senha)
  const { error } = await admin.from('senhas_acesso').insert({
    rotulo: parsed.data.rotulo,
    hash,
    criado_por: uid,
  })
  if (error) return { ok: false, erro: 'Não foi possível criar a senha.' }

  revalidatePath('/admin/senhas')
  return { ok: true }
}

export async function definirStatusSenha(
  id: string,
  ativa: boolean,
): Promise<ActionResult> {
  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, erro: 'Senha inválida.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('senhas_acesso')
    .update({ ativa })
    .eq('id', id)
  if (error) return { ok: false, erro: 'Não foi possível atualizar a senha.' }

  revalidatePath('/admin/senhas')
  return { ok: true }
}
