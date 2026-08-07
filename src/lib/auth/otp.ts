import { type EmailOtpType } from '@supabase/supabase-js'

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
// destinoRelatorio (lib/actions/senhas.ts). Fora disso cai na home. Fecha o
// open redirect.
export function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (next.includes('..') || next.includes('\\')) return '/'
  if (next.includes('\n') || next.includes('\r') || next.includes('\t')) return '/'
  return next
}

// FLX-01 — redirect (string) para a entrada por senha dos relatórios,
// preservando o destino atual em `next`. Usado pelo layout e pelas 3 páginas de
// /relatorios/** quando a sessão do visualizador está ausente/expirada: sem
// isto, o ViewerAutoRefresh (60s) — que dispara estes redirects NO MEIO da
// leitura — mandava o gestor sempre para /relatorios/geral, perdendo filial,
// período e filtros.
//
// `pathname`/`search` vêm dos headers `x-wap-pathname`/`x-wap-search` que o
// proxy grava (lib/supabase/proxy.ts): é o único lugar com o valor CRU da rota
// atual dentro de um Server Component — o layout do grupo não recebe
// `searchParams` (só as páginas recebem), e reconstruir a partir do objeto já
// parseado arriscaria divergir do que o navegador realmente pediu.
//
// Sem sanitizar aqui de propósito — mesma disciplina do proxy (que só GRAVA o
// destino no redirect de /relatorios, sem validar): quem VALIDA é o consumidor
// (`entrarComSenha` / `destinoRelatorio`, lib/actions/senhas.ts), que já
// restringe a `/relatorios/**`. `pathname` e `search` aqui são sempre da
// PRÓPRIA rota atual (o proxy os deriva de `request.nextUrl`), nunca entrada
// arbitrária de terceiro — não há open redirect para fechar nesta função.
export function redirectAcessoRelatorios(pathname: string, search: string): string {
  const destino = pathname + search
  return `/relatorios/acesso?next=${encodeURIComponent(destino)}`
}
