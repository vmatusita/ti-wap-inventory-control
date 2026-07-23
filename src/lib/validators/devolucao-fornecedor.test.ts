import { describe, it, expect } from 'vitest'
import {
  substitutoSchema,
  devolverFornecedorSchema,
} from '@/lib/validators/devolucao-fornecedor'

// F15/C1 — o cadastro do SUBSTITUTO (devolução ao fornecedor) passou a EXIGIR service
// tag, espelho da compra. "Sem substituto" (null) segue válido. Data fixa no passado
// para nunca esbarrar na regra "não-futura" (dataNaoFuturaSchema).
const UUID = '11111111-2222-4333-8444-555555555555'
const substitutoBase = {
  patrimonio: 'WAP0001234',
  service_tag: 'ST1',
  categoria: 'notebook',
  marca: 'Dell',
  modelo: 'Latitude 5440',
  filial_id: 1,
  data: '2020-01-01',
}

describe('substitutoSchema (F15/C1 — service tag obrigatória)', () => {
  it('aceita substituto com service tag', () => {
    expect(substitutoSchema.safeParse(substitutoBase).success).toBe(true)
  })

  it('recusa substituto sem service tag (ausente)', () => {
    const { service_tag: _omit, ...semTag } = substitutoBase
    const r = substitutoSchema.safeParse(semTag)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => /service tag/i.test(i.message))).toBe(true)
    }
  })

  it('recusa service tag vazia ou só espaços', () => {
    expect(substitutoSchema.safeParse({ ...substitutoBase, service_tag: '' }).success).toBe(false)
    expect(substitutoSchema.safeParse({ ...substitutoBase, service_tag: '  ' }).success).toBe(false)
  })
})

describe('devolverFornecedorSchema', () => {
  it('aceita "sem substituto" (null)', () => {
    const r = devolverFornecedorSchema.safeParse({
      ativo_id: UUID,
      data: '2020-01-01',
      substituto: null,
    })
    expect(r.success).toBe(true)
  })

  it('exige service tag quando há substituto', () => {
    const { service_tag: _omit, ...semTag } = substitutoBase
    const r = devolverFornecedorSchema.safeParse({
      ativo_id: UUID,
      data: '2020-01-01',
      substituto: semTag,
    })
    expect(r.success).toBe(false)
  })
})
