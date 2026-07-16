import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  assinarSessaoView,
  lerSessaoView,
  VIEW_MAX_AGE_SEG,
} from '@/lib/auth/senha-sessao'

// senha-sessao.ts importa 'server-only' (guarda para não vazar node:crypto ao
// cliente). No ambiente de teste (node) esse módulo lançaria — stub vazio.
vi.mock('server-only', () => ({}))

// Segredo FICTÍCIO só para o teste (>= 16 chars). Nunca é um segredo real.
const SEGREDO = 'segredo-de-teste-hmac-com-32-caracteres'

// Relógio fixo (mock): 16/07/2026 12:00:00 UTC.
const AGORA_MS = Date.UTC(2026, 6, 16, 12, 0, 0)
const AGORA_SEG = Math.floor(AGORA_MS / 1000)
const HORA = 60 * 60
const DIA = 24 * HORA

beforeAll(() => {
  process.env.VIEW_SESSION_SECRET = SEGREDO
})

// Forja um cookie com assinatura VÁLIDA e `exp` arbitrário — replica exatamente
// o formato interno (`base64url(json).hmacSha256Base64url`). Usado para simular
// cookies do regime antigo (exp de 30 dias) que precisam ser rejeitados.
function forjarCookie(sid: string, expSeg: number): string {
  const body = Buffer.from(JSON.stringify({ sid, exp: expSeg })).toString(
    'base64url',
  )
  const sig = createHmac('sha256', SEGREDO).update(body).digest('base64url')
  return `${body}.${sig}`
}

describe('VIEW_MAX_AGE_SEG', () => {
  it('é 24h (decisão 16/07/2026 — antes eram 30 dias)', () => {
    expect(VIEW_MAX_AGE_SEG).toBe(24 * 60 * 60)
  })
})

describe('assinarSessaoView', () => {
  it('emite exp = agora + 24h e maxAge de 24h', () => {
    const { value, maxAge } = assinarSessaoView('senha-1', AGORA_MS)
    expect(maxAge).toBe(VIEW_MAX_AGE_SEG)

    const body = value.slice(0, value.lastIndexOf('.'))
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    expect(payload.sid).toBe('senha-1')
    expect(payload.exp).toBe(AGORA_SEG + VIEW_MAX_AGE_SEG)
  })
})

describe('lerSessaoView', () => {
  it('lê de volta o senhaId de um cookie recém-assinado (round-trip)', () => {
    const { value } = assinarSessaoView('senha-1', AGORA_MS)
    expect(lerSessaoView(value, AGORA_MS)).toEqual({ senhaId: 'senha-1' })
  })

  it('rejeita cookie ausente', () => {
    expect(lerSessaoView(undefined, AGORA_MS)).toBeNull()
  })

  it('rejeita formato sem separador de assinatura', () => {
    expect(lerSessaoView('semponto', AGORA_MS)).toBeNull()
  })

  it('rejeita cookie expirado (exp no passado)', () => {
    // Assinado 25h atrás → exp já passou em relação a AGORA_MS.
    const { value } = assinarSessaoView('senha-1', AGORA_MS - 25 * HORA * 1000)
    expect(lerSessaoView(value, AGORA_MS)).toBeNull()
  })

  it('aceita cookie dentro da janela de 24h', () => {
    const emUmaHora = forjarCookie('senha-1', AGORA_SEG + HORA)
    expect(lerSessaoView(emUmaHora, AGORA_MS)).toEqual({ senhaId: 'senha-1' })
  })

  it('rejeita assinatura inválida (payload adulterado)', () => {
    const { value } = assinarSessaoView('senha-1', AGORA_MS)
    const corte = value.lastIndexOf('.')
    // Reaproveita a assinatura original com outro corpo → HMAC não confere.
    const outroBody = Buffer.from(
      JSON.stringify({ sid: 'senha-2', exp: AGORA_SEG + HORA }),
    ).toString('base64url')
    const adulterado = `${outroBody}.${value.slice(corte + 1)}`
    expect(lerSessaoView(adulterado, AGORA_MS)).toBeNull()
  })

  it('rejeita assinatura de outro segredo', () => {
    const body = Buffer.from(
      JSON.stringify({ sid: 'senha-1', exp: AGORA_SEG + HORA }),
    ).toString('base64url')
    const sigErrada = createHmac('sha256', 'outro-segredo-qualquer-16+')
      .update(body)
      .digest('base64url')
    expect(lerSessaoView(`${body}.${sigErrada}`, AGORA_MS)).toBeNull()
  })

  it('rejeita cookie do regime antigo (exp de 30 dias, mesmo bem assinado)', () => {
    const trintaDias = forjarCookie('senha-1', AGORA_SEG + 30 * DIA)
    expect(lerSessaoView(trintaDias, AGORA_MS)).toBeNull()
  })

  it('rejeita exp logo acima do teto (24h + folga)', () => {
    // 24h + 2min → passa da folga de 60s → rejeitado.
    const acimaDoTeto = forjarCookie('senha-1', AGORA_SEG + DIA + 120)
    expect(lerSessaoView(acimaDoTeto, AGORA_MS)).toBeNull()
  })
})
