import { describe, it, expect } from 'vitest'
import {
  destinoSeguro,
  redirectAcessoRelatorios,
  tipoOtpValido,
  TIPOS_OTP,
} from '@/lib/auth/otp'

// R-ACC-20 — helpers síncronos e PUROS compartilhados por /auth/confirm e a Server
// Action confirmarAcesso. otp.ts não importa 'server-only' e só traz um type-only de
// @supabase/supabase-js (apagado em runtime), então importa direto no ambiente node.

describe('destinoSeguro — anti open-redirect (R-ACC-20)', () => {
  it('aceita caminho interno relativo', () => {
    expect(destinoSeguro('/ativos')).toBe('/ativos')
    expect(destinoSeguro('/relatorios/matriz')).toBe('/relatorios/matriz')
    expect(destinoSeguro('/ativos/123?q=1')).toBe('/ativos/123?q=1')
  })

  it('null ou vazio caem na home', () => {
    expect(destinoSeguro(null)).toBe('/')
    expect(destinoSeguro('')).toBe('/')
  })

  it('caminho que não começa com "/" cai na home', () => {
    expect(destinoSeguro('ativos')).toBe('/')
    expect(destinoSeguro('relatorios/matriz')).toBe('/')
  })

  it('URL absoluta é rejeitada (não começa com "/")', () => {
    expect(destinoSeguro('http://evil.com')).toBe('/')
    expect(destinoSeguro('https://evil.com/path')).toBe('/')
  })

  it('protocolo-relativo "//host" é rejeitado', () => {
    expect(destinoSeguro('//evil.com')).toBe('/')
    expect(destinoSeguro('//evil.com/callback')).toBe('/')
  })

  it('backslash logo após a barra ("/\\") é rejeitado', () => {
    expect(destinoSeguro('/\\evil.com')).toBe('/')
  })

  it('traversal (contém "..") é rejeitado', () => {
    expect(destinoSeguro('/ativos/../../etc/passwd')).toBe('/')
    expect(destinoSeguro('/..')).toBe('/')
  })

  it('backslash em qualquer posição é rejeitado', () => {
    expect(destinoSeguro('/ativos\\evil')).toBe('/')
  })

  it('CRLF / tab (injeção de header) são rejeitados', () => {
    expect(destinoSeguro('/ativos\nSet-Cookie: x')).toBe('/')
    expect(destinoSeguro('/ativos\r\nx')).toBe('/')
    expect(destinoSeguro('/ativos\tx')).toBe('/')
  })
})

describe('tipoOtpValido — allowlist de EmailOtpType (R-ACC-20)', () => {
  it('aceita cada tipo da allowlist e devolve o próprio valor', () => {
    for (const t of TIPOS_OTP) {
      expect(tipoOtpValido(t)).toBe(t)
    }
  })

  it('aceita os tipos esperados individualmente', () => {
    expect(tipoOtpValido('invite')).toBe('invite')
    expect(tipoOtpValido('recovery')).toBe('recovery')
    expect(tipoOtpValido('email')).toBe('email')
    expect(tipoOtpValido('magiclink')).toBe('magiclink')
    expect(tipoOtpValido('signup')).toBe('signup')
    expect(tipoOtpValido('email_change')).toBe('email_change')
  })

  it('null é rejeitado', () => {
    expect(tipoOtpValido(null)).toBeNull()
  })

  it('valor fora da allowlist é rejeitado', () => {
    expect(tipoOtpValido('bogus')).toBeNull()
    expect(tipoOtpValido('')).toBeNull()
    expect(tipoOtpValido('phone_change')).toBeNull()
  })

  it('é case-sensitive (allowlist exige match exato)', () => {
    expect(tipoOtpValido('INVITE')).toBeNull()
    expect(tipoOtpValido('Recovery')).toBeNull()
  })
})

describe('redirectAcessoRelatorios — monta o next da entrada por senha (FLX-01)', () => {
  it('combina pathname e search no next, codificado', () => {
    expect(redirectAcessoRelatorios('/relatorios/matriz', '?preset=mes')).toBe(
      '/relatorios/acesso?next=%2Frelatorios%2Fmatriz%3Fpreset%3Dmes',
    )
  })

  it('sem search, o next é só o pathname', () => {
    expect(redirectAcessoRelatorios('/relatorios/gerados/abc-123', '')).toBe(
      '/relatorios/acesso?next=%2Frelatorios%2Fgerados%2Fabc-123',
    )
  })

  it('o next decodifica de volta ao valor original (round-trip)', () => {
    const pathname = '/relatorios/geral'
    const search = '?filial=cd-sul&filial=matriz'
    const url = redirectAcessoRelatorios(pathname, search)
    const next = new URL(`https://x${url}`).searchParams.get('next')
    expect(next).toBe(pathname + search)
  })
})
