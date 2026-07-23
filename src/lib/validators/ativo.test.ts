import { describe, it, expect } from 'vitest'
import { definirServiceTagSchema, validarCorrecaoPatrimonio } from '@/lib/validators/ativo'

// Função pura da correção de patrimônio (B7, F6B): canonicaliza o novo valor e
// detecta no-op contra o atual. Só testa lógica pura — nada de banco/servidor.
describe('validarCorrecaoPatrimonio', () => {
  it('canonicaliza o novo patrimônio e marca noop=false quando muda', () => {
    const r = validarCorrecaoPatrimonio('WAP0000001', 'WAP4491')
    expect(r).toEqual({ ok: true, patrimonio: 'WAP0004491', noop: false })
  })

  it('normaliza caixa, espaços e hífens antes de comparar', () => {
    const r = validarCorrecaoPatrimonio('WAP0000001', '  wap-4491 ')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.patrimonio).toBe('WAP0004491')
      expect(r.noop).toBe(false)
    }
  })

  it('detecta no-op quando o novo canoniza para o patrimônio atual', () => {
    // O atual já está no formato canônico; a forma curta resolve para o mesmo.
    const r = validarCorrecaoPatrimonio('WAP0004491', 'WAP4491')
    expect(r).toEqual({ ok: true, patrimonio: 'WAP0004491', noop: true })
  })

  it('detecta no-op quando o novo é idêntico ao atual', () => {
    const r = validarCorrecaoPatrimonio('WAP0004491', 'WAP0004491')
    expect(r).toEqual({ ok: true, patrimonio: 'WAP0004491', noop: true })
  })

  it('rejeita formato inválido (sem prefixo/dígitos) com mensagem clara', () => {
    const r = validarCorrecaoPatrimonio('WAP0004491', 'XYZ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/formato/i)
  })

  it('rejeita entrada vazia', () => {
    expect(validarCorrecaoPatrimonio('WAP0004491', '   ').ok).toBe(false)
  })

  it('rejeita mais de 7 dígitos significativos', () => {
    expect(validarCorrecaoPatrimonio('WAP0004491', 'WAP12345678').ok).toBe(false)
  })

  it('aceita "de" nulo (F7E — ativo importado sem patrimônio) e nunca marca noop', () => {
    const r = validarCorrecaoPatrimonio(null, 'WAP4491')
    expect(r).toEqual({ ok: true, patrimonio: 'WAP0004491', noop: false })
  })
})

// F15/C1 — schema de DEFINIR service tag (a ST é transcrita literal, sem canonicalização).
describe('definirServiceTagSchema', () => {
  const UUID = '11111111-2222-4333-8444-555555555555'

  it('aceita service tag não-vazia e apara espaços', () => {
    const r = definirServiceTagSchema.safeParse({ ativo_id: UUID, service_tag: '  ST-ABC  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.service_tag).toBe('ST-ABC')
  })

  it('recusa service tag vazia ou só espaços', () => {
    expect(definirServiceTagSchema.safeParse({ ativo_id: UUID, service_tag: '' }).success).toBe(false)
    expect(definirServiceTagSchema.safeParse({ ativo_id: UUID, service_tag: '   ' }).success).toBe(false)
  })

  it('recusa ativo_id fora de UUID', () => {
    expect(definirServiceTagSchema.safeParse({ ativo_id: 'x', service_tag: 'ST1' }).success).toBe(false)
  })

  it('não canonicaliza — preserva o valor literal da etiqueta', () => {
    const r = definirServiceTagSchema.safeParse({ ativo_id: UUID, service_tag: 'abc-123' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.service_tag).toBe('abc-123')
  })
})
