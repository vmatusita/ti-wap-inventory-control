import { type EmailOtpType } from '@supabase/supabase-js'

// Helpers compartilhados entre a pagina /auth/confirm e a Server Action
// confirmarAcesso (lib/actions/auth.ts). Fica FORA de um modulo 'use server'
// porque estes sao valores/funcoes sincronas — um arquivo 'use server' so pode
// exportar funcoes async.

// Allowlist dos tipos de OTP aceitos (evita repassar valor arbitrario ao
// verifyOtp).
export const TIPOS_OTP: EmailOtpType[] = [
  'invite',
  'recovery',
  'email',
  'magiclink',
  'signup',
  'email_change',
]

export function tipoOtpValido(raw: string | null): EmailOtpType | null {
  return raw && TIPOS_OTP.includes(raw as EmailOtpType)
    ? (raw as EmailOtpType)
    : null
}

// `next` so pode ser um caminho INTERNO. Bloqueia URL absoluta, protocolo-
// relativo (//host), backslash, traversal e CRLF — mesma doutrina de
// destinoRelatorio (lib/actions/senhas.ts). Fora disso cai na home. Fecha o
// open redirect.
export function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (next.includes('..') || next.includes('\\')) return '/'
  if (next.includes('\n') || next.includes('\r') || next.includes('\t')) return '/'
  return next
}
