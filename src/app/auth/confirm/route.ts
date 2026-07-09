import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Fluxo de convite / recuperacao de senha (token_hash + type).
// O template de e-mail no Supabase deve apontar para:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })

    if (!error) {
      // Convite e recuperacao caem na tela de definir senha; demais seguem.
      const destino =
        type === 'invite' || type === 'recovery' ? '/auth/definir-senha' : next
      return NextResponse.redirect(new URL(destino, request.url))
    }
  }

  return NextResponse.redirect(new URL('/login?erro=confirmacao', request.url))
}
