'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOperador } from '@/lib/auth/acesso'
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

// ---- Rate-limit simples em memória por IP (OS-F3 3.9.1) ----
const JANELA_MS = 60_000
const MAX_TENTATIVAS = 5
const tentativas = new Map<string, { count: number; reset: number }>()

function ipCliente(h: Headers): string {
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'desconhecido'
}

function excedeuRateLimit(ip: string): boolean {
  const agora = Date.now()
  const reg = tentativas.get(ip)
  if (!reg || reg.reset < agora) {
    tentativas.set(ip, { count: 1, reset: agora + JANELA_MS })
    return false
  }
  reg.count += 1
  return reg.count > MAX_TENTATIVAS
}

// ---- Entrar por senha (público) ----

export type EntrarState = { erro?: string }

export async function entrarComSenha(
  _prev: EntrarState,
  formData: FormData,
): Promise<EntrarState> {
  const h = await headers()
  if (excedeuRateLimit(ipCliente(h))) {
    return { erro: 'Muitas tentativas. Aguarde um instante e tente de novo.' }
  }

  const senha = String(formData.get('senha') ?? '')
  if (senha.length < 1) {
    return { erro: 'Senha inválida.' }
  }

  const admin = createAdminClient()
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

  redirect('/relatorios/geral')
}

// ---- Sair da visualização (apaga o cookie) ----
export async function sairVisualizacao() {
  const cookieStore = await cookies()
  cookieStore.set(VIEW_COOKIE_NAME, '', { path: '/relatorios', maxAge: 0 })
  redirect('/relatorios/acesso')
}

// ---- Gestão das senhas (admin) ----

const criarSchema = z.object({
  rotulo: z.string().trim().min(2, 'Informe um rótulo').max(80),
  senha: z
    .string()
    .min(8, 'A senha precisa de ao menos 8 caracteres')
    .max(200),
})

export type CriarSenhaResult = { ok: boolean; erro?: string }

export async function criarSenhaAcesso(input: {
  rotulo: string
  senha: string
}): Promise<CriarSenhaResult> {
  const operador = await getOperador()
  if (!operador) return { ok: false, erro: 'Sessão expirada. Faça login.' }

  const parsed = criarSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const admin = createAdminClient()
  const hash = await hashSenha(parsed.data.senha)
  const { error } = await admin.from('senhas_acesso').insert({
    rotulo: parsed.data.rotulo,
    hash,
    criado_por: operador.id,
  })
  if (error) return { ok: false, erro: 'Não foi possível criar a senha.' }

  revalidatePath('/admin/senhas')
  return { ok: true }
}

export async function definirStatusSenha(
  id: string,
  ativa: boolean,
): Promise<CriarSenhaResult> {
  const operador = await getOperador()
  if (!operador) return { ok: false, erro: 'Sessão expirada. Faça login.' }
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
