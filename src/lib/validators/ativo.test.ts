import { describe, it, expect } from 'vitest'
import { validarCorrecaoPatrimonio } from '@/lib/validators/ativo'

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
