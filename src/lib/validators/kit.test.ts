import { describe, it, expect } from 'vitest'
import {
  MSG_KIT_CATEGORIA_REPETIDA,
  MSG_KIT_SEM_CATEGORIA,
  TIPOS_EXCLUIDOS_DO_KIT,
  TIPOS_KIT,
  atualizarKitSchema,
  checklistCategoriasDoKit,
  desativarKitSchema,
  faltaCategoriaDoKit,
  kitCatalogoSchema,
  kitPayloadSchema,
} from '@/lib/validators/kit'
import { Constants } from '@/lib/types/database'
import { CATEGORIA_ORDEM } from '@/lib/dominio'

// Kits de movimentação (F12 · M12). Dados 100% fictícios (CLAUDE.md).
// UUID fictício VÁLIDO em RFC 4122: o Zod 4 confere os nibbles de versão (3º
// grupo começa com 4) e de variante (4º grupo começa com 8/9/a/b) — um
// '1111-2222-3333-4444-…' decorativo seria recusado e o teste mentiria.
const UUID_FICTICIO = '11111111-2222-4333-8444-555555555555'

function payloadBase(over: Record<string, unknown> = {}) {
  return { tipo: 'saida', categorias: ['notebook'], ...over }
}

describe('TIPOS_KIT', () => {
  it('é exatamente o enum do banco MENOS compra e estorno', () => {
    const esperado = Constants.public.Enums.tipo_movimentacao.filter(
      (t) => !(TIPOS_EXCLUIDOS_DO_KIT as readonly string[]).includes(t),
    )
    expect([...TIPOS_KIT]).toEqual(esperado)
  })

  it('não contém compra nem estorno', () => {
    expect(TIPOS_KIT).not.toContain('compra')
    expect(TIPOS_KIT).not.toContain('estorno')
  })
})

describe('kitPayloadSchema', () => {
  it('aceita o payload mínimo (tipo + 1 categoria)', () => {
    const r = kitPayloadSchema.safeParse(payloadBase())
    expect(r.success).toBe(true)
    expect(r.data?.categorias).toEqual(['notebook'])
  })

  it('aceita o kit completo do caso de uso (novo colaborador)', () => {
    const r = kitPayloadSchema.safeParse({
      tipo: 'saida',
      motivo: 'novo_colaborador',
      termo: 'gerado',
      observacao: 'Kit fictício de teste',
      categorias: ['notebook', 'monitor', 'celular'],
    })
    expect(r.success).toBe(true)
    expect(r.data?.motivo).toBe('novo_colaborador')
    expect(r.data?.termo).toBe('gerado')
  })

  it('recusa tipo compra e tipo estorno', () => {
    for (const tipo of TIPOS_EXCLUIDOS_DO_KIT) {
      const r = kitPayloadSchema.safeParse(payloadBase({ tipo }))
      expect(r.success).toBe(false)
      expect(r.error?.issues[0]?.message).toBe('Escolha o tipo da movimentação')
    }
  })

  it('recusa tipo fora do enum', () => {
    expect(kitPayloadSchema.safeParse(payloadBase({ tipo: 'teletransporte' })).success).toBe(false)
  })

  it('exige ao menos uma categoria', () => {
    const r = kitPayloadSchema.safeParse(payloadBase({ categorias: [] }))
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.message === MSG_KIT_SEM_CATEGORIA)).toBe(true)
  })

  it('recusa categoria repetida', () => {
    const r = kitPayloadSchema.safeParse(
      payloadBase({ categorias: ['notebook', 'monitor', 'notebook'] }),
    )
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.message === MSG_KIT_CATEGORIA_REPETIDA)).toBe(true)
  })

  it('recusa categoria fora do enum', () => {
    expect(kitPayloadSchema.safeParse(payloadBase({ categorias: ['impressora'] })).success).toBe(
      false,
    )
  })

  it('recusa status de termo fora do enum', () => {
    expect(kitPayloadSchema.safeParse(payloadBase({ termo: 'talvez' })).success).toBe(false)
  })

  it('texto vazio ou só-espaços vira AUSENTE (nunca "" no jsonb)', () => {
    const r = kitPayloadSchema.safeParse(
      payloadBase({ motivo: '', observacao: '   ', termo: undefined }),
    )
    expect(r.success).toBe(true)
    expect(r.data?.motivo).toBeUndefined()
    expect(r.data?.observacao).toBeUndefined()
    expect(r.data?.termo).toBeUndefined()
  })

  it('texto com espaços nas pontas é trimado', () => {
    const r = kitPayloadSchema.safeParse(payloadBase({ observacao: '  entrega fictícia  ' }))
    expect(r.data?.observacao).toBe('entrega fictícia')
  })

  it('observação acima de 500 caracteres é recusada', () => {
    const r = kitPayloadSchema.safeParse(payloadBase({ observacao: 'x'.repeat(501) }))
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('Observação: no máximo 500 caracteres')
  })

  it('payload corrompido (o que a leitura defensiva descarta) não passa', () => {
    expect(kitPayloadSchema.safeParse(null).success).toBe(false)
    expect(kitPayloadSchema.safeParse('kit').success).toBe(false)
    expect(kitPayloadSchema.safeParse({}).success).toBe(false)
    expect(kitPayloadSchema.safeParse({ tipo: 'saida' }).success).toBe(false)
  })
})

describe('kitCatalogoSchema / atualizarKitSchema / desativarKitSchema', () => {
  it('exige nome com 2+ caracteres', () => {
    expect(kitCatalogoSchema.safeParse({ nome: 'K', payload: payloadBase() }).success).toBe(false)
    const r = kitCatalogoSchema.safeParse({ nome: '  Kit fictício  ', payload: payloadBase() })
    expect(r.success).toBe(true)
    expect(r.data?.nome).toBe('Kit fictício')
  })

  it('nome acima de 80 caracteres é recusado', () => {
    const r = kitCatalogoSchema.safeParse({ nome: 'K'.repeat(81), payload: payloadBase() })
    expect(r.success).toBe(false)
  })

  it('atualizar exige id uuid e o flag ativo', () => {
    const ok = atualizarKitSchema.safeParse({
      id: UUID_FICTICIO,
      nome: 'Kit fictício',
      payload: payloadBase(),
      ativo: false,
    })
    expect(ok.success).toBe(true)
    expect(ok.data?.ativo).toBe(false)

    const semUuid = atualizarKitSchema.safeParse({
      id: '42',
      nome: 'Kit fictício',
      payload: payloadBase(),
      ativo: true,
    })
    expect(semUuid.success).toBe(false)
    expect(semUuid.error?.issues[0]?.message).toBe('Kit inválido')
  })

  it('desativar só precisa do id', () => {
    expect(desativarKitSchema.safeParse({ id: UUID_FICTICIO }).success).toBe(true)
    expect(desativarKitSchema.safeParse({ id: 'nao-e-uuid' }).success).toBe(false)
  })
})

describe('checklistCategoriasDoKit', () => {
  it('devolve uma linha por categoria esperada, marcando as presentes', () => {
    const r = checklistCategoriasDoKit(['notebook', 'monitor', 'celular'], ['notebook'])
    expect(r).toEqual([
      { categoria: 'notebook', presente: true },
      { categoria: 'celular', presente: false },
      { categoria: 'monitor', presente: false },
    ])
  })

  it('respeita a ordem canônica CATEGORIA_ORDEM, não a ordem do kit', () => {
    const r = checklistCategoriasDoKit(['outro', 'notebook', 'monitor'], [])
    expect(r.map((c) => c.categoria)).toEqual(
      CATEGORIA_ORDEM.filter((c) => ['outro', 'notebook', 'monitor'].includes(c)),
    )
    expect(r.map((c) => c.categoria)).toEqual(['notebook', 'monitor', 'outro'])
  })

  it('categoria do lote que o kit não esperava NÃO entra no checklist', () => {
    const r = checklistCategoriasDoKit(['notebook'], ['notebook', 'tablet', 'desktop'])
    expect(r).toEqual([{ categoria: 'notebook', presente: true }])
  })

  it('categoria repetida na entrada vira uma linha só', () => {
    const r = checklistCategoriasDoKit(
      ['monitor', 'monitor'],
      ['monitor', 'monitor', 'monitor'],
    )
    expect(r).toEqual([{ categoria: 'monitor', presente: true }])
  })

  it('kit sem categorias (defensivo) devolve checklist vazio', () => {
    expect(checklistCategoriasDoKit([], ['notebook'])).toEqual([])
  })

  it('tudo presente → checklist completo', () => {
    const r = checklistCategoriasDoKit(['notebook', 'celular'], ['celular', 'notebook'])
    expect(r.every((c) => c.presente)).toBe(true)
  })
})

describe('faltaCategoriaDoKit', () => {
  it('true quando alguma categoria esperada não está no lote', () => {
    expect(faltaCategoriaDoKit(checklistCategoriasDoKit(['notebook', 'monitor'], ['notebook'])))
      .toBe(true)
  })

  it('false quando o lote cobre o kit inteiro', () => {
    expect(
      faltaCategoriaDoKit(checklistCategoriasDoKit(['notebook'], ['notebook', 'monitor'])),
    ).toBe(false)
  })

  it('false no checklist vazio (não há o que avisar)', () => {
    expect(faltaCategoriaDoKit([])).toBe(false)
  })
})
