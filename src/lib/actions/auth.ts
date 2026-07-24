'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  loginSchema,
  definirAcessoSchema,
  type DefinirAcessoInput,
} from '@/lib/validators/auth'
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

// Fecha o convite: a pessoa informa NOME, SOBRENOME e a senha de uma vez
// (/auth/definir-senha). Serve tambem a recuperacao de senha, que cai na mesma
// tela — ali os dois campos ja vem preenchidos e a pessoa so confirma.
//
// Por que Server Action e nao `supabase.auth.updateUser` no navegador (como era
// ate a 0057): a validacao Zod passa a rodar no servidor (convencao do projeto —
// toda escrita e Server Action com Zod dentro) e o nome vai para `profiles` na
// MESMA chamada da senha, sem uma segunda ida do browser ao PostgREST.
//
// A sessao usada aqui e a que `confirmarAcesso` acabou de gravar nos cookies pelo
// verifyOtp; o client de servidor a le normalmente.
//
// ORDEM (perfil antes da senha) e proposital: se a segunda etapa falhar, o pior
// caso e um perfil nomeado sem senha nova — a pessoa reabre o link e tenta de
// novo. O inverso (senha trocada e nome perdido) sairia da tela sem aviso.
export type DefinirAcessoResult = { ok: true } | { ok: false; erro: string }

export async function definirAcesso(
  input: DefinirAcessoInput,
): Promise<DefinirAcessoResult> {
  const parsed = definirAcessoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      erro: parsed.error.issues[0]?.message ?? 'Verifique os campos.',
    }
  }
  const { nome, sobrenome, senha } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      erro: 'Seu link expirou. Peça um novo convite ao administrador.',
    }
  }

  // `profiles.nome` NAO entra no update: e coluna gerada (0057). O `select` de
  // volta e o que denuncia a linha ausente — sem ele um update que casa zero
  // linhas devolve sucesso e o nome se perderia calado.
  const { data: perfil, error: erroPerfil } = await supabase
    .from('profiles')
    .update({ primeiro_nome: nome, sobrenome })
    .eq('id', user.id)
    .select('id')
    .maybeSingle()

  if (erroPerfil || !perfil) {
    return {
      ok: false,
      erro: 'Não foi possível salvar seu nome. Tente novamente.',
    }
  }

  // `data` grava o mesmo par no user_metadata do Auth — e de la que o trigger
  // `handle_new_user` (0057) le nome/sobrenome se a conta for recriada.
  const { error: erroSenha } = await supabase.auth.updateUser({
    password: senha,
    data: { nome, sobrenome },
  })
  if (erroSenha) {
    return {
      ok: false,
      erro: 'Não foi possível definir a senha. Tente novamente.',
    }
  }

  return { ok: true }
}
