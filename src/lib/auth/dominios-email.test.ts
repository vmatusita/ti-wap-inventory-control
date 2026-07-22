import { describe, it, expect } from 'vitest'
import {
  DOMINIOS_OPERADOR,
  DOMINIOS_TEXTO,
  emailDeOperador,
} from '@/lib/auth/dominios-email'

// A trava de verdade é o trigger `handle_new_user` (migration 0041); estes testes
// cobrem a segunda linha (client + Server Action). Os mesmos casos estão no
// roteiro SQL `supabase/tests/dominios_login.sql`, que roda no CI contra o banco.

describe('emailDeOperador', () => {
  it('aceita os três domínios da spec §3', () => {
    expect(emailDeOperador('ana@wap.ind.br')).toBe(true)
    expect(emailDeOperador('bruno@stefanini.com')).toBe(true)
    expect(emailDeOperador('carla@latam.stefanini.com')).toBe(true)
  })

  it('ignora caixa e espaços em volta', () => {
    expect(emailDeOperador('  ANA@WAP.IND.BR ')).toBe(true)
    expect(emailDeOperador('Bruno@Stefanini.Com')).toBe(true)
  })

  it('recusa domínio de fora', () => {
    expect(emailDeOperador('dora@gmail.com')).toBe(false)
    expect(emailDeOperador('')).toBe(false)
  })

  it('exige o @ antes do domínio — sufixo parecido não passa', () => {
    expect(emailDeOperador('eva@fake-stefanini.com')).toBe(false)
    expect(emailDeOperador('eva@meuwap.ind.br')).toBe(false)
  })

  it('recusa domínio vizinho e domínio no meio do endereço', () => {
    expect(emailDeOperador('gil@stefanini.com.br')).toBe(false)
    expect(emailDeOperador('ian@latam.stefanini.com.mx')).toBe(false)
    expect(emailDeOperador('joao@wap.ind.br.exemplo.com')).toBe(false)
  })

  it('não aceita subdomínio não listado', () => {
    expect(emailDeOperador('kim@br.stefanini.com')).toBe(false)
  })
})

describe('DOMINIOS_TEXTO', () => {
  it('lista todos os domínios, com "ou" antes do último', () => {
    expect(DOMINIOS_TEXTO).toBe('@wap.ind.br, @stefanini.com ou @latam.stefanini.com')
  })

  it('cita cada domínio configurado (não deixa nenhum de fora)', () => {
    for (const dominio of DOMINIOS_OPERADOR) {
      expect(DOMINIOS_TEXTO).toContain(dominio)
    }
  })
})
