import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Fluxo de convite / recuperacao de senha (token_hash + type).
// O template de e-mail no Supabase deve apontar para:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}

// Allowlist dos tipos de OTP aceitos (evita repassar valor arbitrario ao verifyOtp).
const TIPOS_OTP: EmailOtpType[] = [
  'invite',
  'recovery',
  'email',
  'magiclink',
  'signup',
  'email_change',
]

// `next` so pode ser um caminho INTERNO. Bloqueia URL absoluta, protocolo-relativo
// (//host), backslash, traversal e CRLF — mesma doutrina de destinoRelatorio
// (lib/actions/senhas.ts). Fora disso cai na home. Fecha o open redirect.
function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (next.includes('..') || next.includes('\\')) return '/'
  if (next.includes('\n') || next.includes('\r') || next.includes('\t')) return '/'
  return next
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const typeRaw = searchParams.get('type')
  const type = TIPOS_OTP.includes(typeRaw as EmailOtpType)
    ? (typeRaw as EmailOtpType)
    : null

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })

    if (!error) {
      // Convite e recuperacao caem na tela de definir senha; demais seguem para
      // o `next` — sanitizado para so aceitar caminho interno (anti open redirect).
      const destino =
        type === 'invite' || type === 'recovery'
          ? '/auth/definir-senha'
          : destinoSeguro(searchParams.get('next'))
      return NextResponse.redirect(new URL(destino, request.url))
    }
  }

  return NextResponse.redirect(new URL('/login?erro=confirmacao', request.url))
}
