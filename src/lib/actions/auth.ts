'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validators/auth'

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
    return { erro: 'E-mail ou senha invalidos' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (error) {
    return { erro: 'E-mail ou senha invalidos' }
  }

  redirect('/')
}

// Encerra a sessao e volta para o login.
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
