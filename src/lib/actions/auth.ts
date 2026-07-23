'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validators/auth'
import { tipoOtpValido, destinoSeguro } from '@/lib/auth/otp'

export type LoginState = { erro?: string }

// Login por e-mail + senha. A sessao e gravada nos cookies pelo cliente server.
export async function signIn(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    senha: formData.get('senha'),
  })

  if (!parsed.success) {
    return { erro: 'E-mail ou senha inválidos' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (error) {
    return { erro: 'E-mail ou senha inválidos' }
  }

  redirect('/')
}

// Encerra a sessao e volta para o login.
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// Confirma o convite / recuperacao (token_hash + type) — SO no clique explicito
// do usuario (POST desta Server Action), NUNCA no GET da pagina /auth/confirm.
//
// Esta e a defesa contra "email/link prefetching": scanners de seguranca e as
// previas de link do WhatsApp/Teams/Outlook/Gmail abrem a URL com um GET para
// montar o cartao de previa e consumiriam o token de uso unico ANTES da pessoa
// clicar — fazendo o link "expirar" na hora para o destinatario. Como esses bots
// nao submetem o formulario, o token sobrevive ate o clique humano.
// (Supabase, guia "OTP Verification Failures / Email prefetching": a mitigacao
// recomendada e so invalidar o token quando o usuario ENVIA, nao ao acessar a URL.)
export async function confirmarAcesso(formData: FormData): Promise<void> {
  const tokenHashRaw = formData.get('token_hash')
  const tokenHash = typeof tokenHashRaw === 'string' ? tokenHashRaw : null
  const typeRaw = formData.get('type')
  const type = tipoOtpValido(typeof typeRaw === 'string' ? typeRaw : null)

  if (!tokenHash || !type) {
    redirect('/auth/confirm?erro=1')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    // Token expirado / ja usado (ou consumido por um prefetch anterior). Volta
    // para a propria pagina com erro inline — nao manda para /login, que
    // confundiria quem ainda nem tem senha definida.
    redirect('/auth/confirm?erro=1')
  }

  // Convite e recuperacao caem na tela de definir senha; demais seguem o `next`
  // sanitizado (so caminho interno — anti open redirect).
  const nextRaw = formData.get('next')
  const destino =
    type === 'invite' || type === 'recovery'
      ? '/auth/definir-senha'
      : destinoSeguro(typeof nextRaw === 'string' ? nextRaw : null)

  redirect(destino)
}
