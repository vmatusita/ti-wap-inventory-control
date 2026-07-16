import 'server-only'
import {
  scrypt,
  randomBytes,
  timingSafeEqual,
  createHmac,
} from 'node:crypto'
import { promisify } from 'node:util'
import { VIEW_COOKIE_NAME } from '@/lib/auth/view-cookie'

export { VIEW_COOKIE_NAME }

// Sessão de VISUALIZAÇÃO por senha (spec §3 / OS-F3 3.9). Duas metades:
//   1) hash das senhas de acesso — `crypto.scrypt` NATIVO (CLAUDE.md proíbe lib
//      de hash). Guarda-se só o hash; a senha em claro nunca é logada/armazenada.
//   2) cookie httpOnly assinado com HMAC-SHA256 (VIEW_SESSION_SECRET) contendo
//      {sid: senha_id, exp}. A verificação usa node:crypto — roda no runtime
//      Node (Server Components/Actions/Route Handlers), NUNCA no proxy (Edge).
//
// O proxy só checa a PRESENÇA do cookie; a verificação real (assinatura + senha
// ainda ativa no banco) roda no servidor Node a cada request de relatório
// (lib/auth/acesso.ts) — é o que faz "revogar matar o acesso no request
// seguinte" (OS-F3 3.9.3).

const scryptAsync = promisify(scrypt)
const KEYLEN = 64
const SALT_BYTES = 16

// ---- Hash de senha de acesso (scrypt) ----

// Formato do hash guardado: `scrypt$<salt hex>$<derivado hex>`.
export async function hashSenha(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex')
  const derived = (await scryptAsync(plain, salt, KEYLEN)) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

// Comparação timing-safe da senha informada contra o hash guardado.
export async function verificarSenha(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, hashHex] = parts
  let hash: Buffer
  try {
    hash = Buffer.from(hashHex, 'hex')
  } catch {
    return false
  }
  if (hash.length === 0) return false
  let derived: Buffer
  try {
    derived = (await scryptAsync(plain, salt, hash.length)) as Buffer
  } catch {
    return false
  }
  return derived.length === hash.length && timingSafeEqual(derived, hash)
}

// ---- Cookie assinado da sessão de visualização (HMAC) ----

// Sessão de visualização expira em 24h (decisão do Johnny, 16/07/2026 — F6B/B8).
// Antes eram 30 dias (OS-F3 3.9.2). Governa OS DOIS lados: o `exp` do payload
// assinado e o `maxAge` do cookie `wap_view` (lib/actions/senhas.ts).
export const VIEW_MAX_AGE_SEG = 24 * 60 * 60 // 24h

// Folga (clock skew) no teto de `exp` aceito por `lerSessaoView`. Serve para
// derrubar cookies do regime antigo de 30 dias: um cookie legítimo tem
// `exp <= agora + VIEW_MAX_AGE_SEG`; qualquer `exp` muito além disso foi assinado
// antes de 16/07/2026 e é rejeitado no request seguinte (o gestor redigita a
// senha — efeito desejado). A revogação por banco continua imediata (acesso.ts).
const FOLGA_TETO_SEG = 60

type PayloadView = { sid: string; exp: number } // sid = senha_id, exp = epoch (s)

function segredo(): string {
  const s = process.env.VIEW_SESSION_SECRET
  if (!s || s.length < 16) {
    throw new Error('VIEW_SESSION_SECRET ausente ou fraco (defina no ambiente).')
  }
  return s
}

function hmac(body: string): string {
  return createHmac('sha256', segredo()).update(body).digest('base64url')
}

// Gera o valor do cookie `body.assinatura` para uma senha, com validade fixa.
export function assinarSessaoView(
  senhaId: string,
  agoraMs: number = Date.now(),
): { value: string; maxAge: number } {
  const exp = Math.floor(agoraMs / 1000) + VIEW_MAX_AGE_SEG
  const payload: PayloadView = { sid: senhaId, exp }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { value: `${body}.${hmac(body)}`, maxAge: VIEW_MAX_AGE_SEG }
}

// Verifica assinatura e expiração; devolve só o senha_id. NÃO consulta o banco —
// quem confere se a senha continua ativa é lib/auth/acesso.ts.
export function lerSessaoView(
  raw: string | undefined,
  agoraMs: number = Date.now(),
): { senhaId: string } | null {
  if (!raw) return null
  const corte = raw.lastIndexOf('.')
  if (corte < 1) return null
  const body = raw.slice(0, corte)
  const assinatura = raw.slice(corte + 1)

  const esperada = hmac(body)
  const a = Buffer.from(assinatura)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: PayloadView
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload.sid !== 'string' || typeof payload.exp !== 'number') {
    return null
  }
  if (payload.exp * 1000 <= agoraMs) return null // expirado
  // Teto anti-regime-antigo: exp não pode ultrapassar agora + 24h + folga. Mata
  // cookies emitidos com validade de 30 dias antes da decisão de 16/07/2026.
  const tetoExpSeg = Math.floor(agoraMs / 1000) + VIEW_MAX_AGE_SEG + FOLGA_TETO_SEG
  if (payload.exp > tetoExpSeg) return null
  return { senhaId: payload.sid }
}
