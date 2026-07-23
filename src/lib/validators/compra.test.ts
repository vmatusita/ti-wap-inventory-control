import { describe, it, expect } from 'vitest'
import { compraItemSchema } from '@/lib/validators/compra'

// F15/C1 — a service tag passou a ser OBRIGATÓRIA no cadastro manual de equipamento
// novo (todas as categorias). O import segue aceitando vazia (pendência); a regra vale
// só dentro do sistema. Testa a função pura do validador (o item patrimônio + tag).
describe('compraItemSchema (F15/C1 — service tag obrigatória)', () => {
  it('aceita item com patrimônio E service tag', () => {
    const r = compraItemSchema.safeParse({ patrimonio: 'WAP0001234', service_tag: 'ST1' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.service_tag).toBe('ST1')
  })

  it('recusa item sem service tag (ausente)', () => {
    const r = compraItemSchema.safeParse({ patrimonio: 'WAP0001234' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => /service tag/i.test(i.message))).toBe(true)
    }
  })

  it('recusa service tag vazia ou só espaços', () => {
    expect(compraItemSchema.safeParse({ patrimonio: 'WAP0001234', service_tag: '' }).success).toBe(false)
    expect(compraItemSchema.safeParse({ patrimonio: 'WAP0001234', service_tag: '   ' }).success).toBe(false)
  })

  it('apara espaços em volta da service tag', () => {
    const r = compraItemSchema.safeParse({ patrimonio: 'WAP0001234', service_tag: '  ST1  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.service_tag).toBe('ST1')
  })

  it('segue recusando patrimônio fora do formato canônico', () => {
    expect(compraItemSchema.safeParse({ patrimonio: 'WAP4491', service_tag: 'ST1' }).success).toBe(false)
  })
})
