import { type EmailOtpType } from '@supabase/supabase-js'
import { portaDaLegada } from '@/lib/auth/porta-rotas'

// Helpers de OTP e de `next` pós-login, compartilhados entre a pagina
// /auth/confirm, as Server Actions de auth.ts (confirmarAcesso, signIn) e as
// rotas de /relatorios/** (FLX-01). Fica FORA de um modulo 'use server' porque
// estes sao valores/funcoes sincronas — um arquivo 'use server' so pode
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
// destinoNaPorta (lib/auth/porta-rotas.ts). Fora disso cai na home. Fecha o
// open redirect.
export function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (next.includes('..') || next.includes('\\')) return '/'
  if (next.includes('\n') || next.includes('\r') || next.includes('\t')) return '/'
  return next
}

// FLX-01 — redirect (string) para a entrada por senha dos relatórios, preservando o destino atual em `next`.
//
// F68 (19/11/2026): a entrada por senha mudou de endereço — é a porta pública DA EMPRESA, `/r/<slug>/relatorios/acesso`.
// Os endereços antigos (`/relatorios/**`) são todos da WAP, então o destino é a porta da LEGADA, com o `next` TRADUZIDO
// para a árvore nova (`/relatorios/gerados…` → `/r/wap/relatorios/gerados…`). É o MESMO destino do 308 do proxy
// (`portaDaLegada`, lib/auth/porta-rotas.ts), usado aqui quando um request sem operador escapa do proxy e chega ao layout
// do grupo `(app)`.
//
// `pathname`/`search` vêm dos headers `x-wap-pathname`/`x-wap-search` que o proxy grava (lib/supabase/proxy.ts): é o
// único lugar com o valor CRU da rota atual dentro de um Server Component. Quem VALIDA o destino é o consumidor
// (`entrarNaPorta` → `destinoNaPorta`, que só aceita caminho da MESMA empresa).
export function redirectAcessoRelatorios(pathname: string, search: string): string {
  return portaDaLegada(pathname, search)
}
