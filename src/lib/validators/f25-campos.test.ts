import { describe, expect, it } from 'vitest'
import { camposTermoSchema } from '@/lib/validators/termo'
import { editarAtivoSchema } from '@/lib/validators/ativo'
import { filialSchema } from '@/lib/validators/admin'
import { compraLoteSchema } from '@/lib/validators/compra'

// F25 — os campos novos e as réguas que eles trouxeram. Dados 100% fictícios.

const ID = '00000000-0000-4000-8000-000000000000'

function edicao(over: Record<string, unknown> = {}) {
  return editarAtivoSchema.safeParse({
    id: ID,
    termo_assinado: '',
    termo_data: '',
    ...over,
  })
}

describe('camposTermoSchema — cidade', () => {
  it('aceita a cidade', () => {
    const r = camposTermoSchema.safeParse({ cidade: 'Linhares' })
    expect(r.success).toBe(true)
  })

  it('aceita nome de cidade comprido (por isso o teto é 120, e não 60)', () => {
    const r = camposTermoSchema.safeParse({ cidade: "Santa Bárbara d'Oeste" })
    expect(r.success).toBe(true)
  })

  it('recusa acima de 120', () => {
    expect(camposTermoSchema.safeParse({ cidade: 'x'.repeat(121) }).success).toBe(false)
    expect(camposTermoSchema.safeParse({ cidade: 'x'.repeat(120) }).success).toBe(true)
  })

  it('os três campos do celular seguem com o teto de 60', () => {
    expect(camposTermoSchema.safeParse({ imei: 'x'.repeat(60) }).success).toBe(true)
    expect(camposTermoSchema.safeParse({ imei: 'x'.repeat(61) }).success).toBe(false)
  })
})

describe('editarAtivoSchema — telefone/IMEI/Pulsus', () => {
  it('aceita os três, opcionais', () => {
    expect(edicao().success).toBe(true)
    const r = edicao({ telefone: '(41) 90000-0000', imei: '000000000000000', pulsus: 'P-1' })
    expect(r.success).toBe(true)
  })

  it('vazio vira ausente (que a action grava como NULL)', () => {
    const r = edicao({ imei: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.imei).toBeUndefined()
  })

  it('faz trim', () => {
    const r = edicao({ imei: '  000000000000000  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.imei).toBe('000000000000000')
  })

  it('SEM máscara de IMEI — o legado vem sujo e é texto livre', () => {
    expect(edicao({ imei: '11111111-111111 / 2222222222' }).success).toBe(true)
  })

  it('teto de 60, espelhando o campo do termo', () => {
    expect(edicao({ imei: 'x'.repeat(60) }).success).toBe(true)
    expect(edicao({ imei: 'x'.repeat(61) }).success).toBe(false)
  })
})

describe('filialSchema — cidade e slugs reservados', () => {
  it('aceita filial com cidade', () => {
    const r = filialSchema.safeParse({ nome: 'Linhares', slug: 'linhares', cidade: 'Linhares' })
    expect(r.success).toBe(true)
  })

  it('cidade é opcional e nasce vazia', () => {
    const r = filialSchema.safeParse({ nome: 'Filial Nova', slug: 'filial-nova' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.cidade).toBe('')
  })

  it('recusa cidade acima de 120', () => {
    const r = filialSchema.safeParse({ nome: 'X Y', slug: 'x-y', cidade: 'c'.repeat(121) })
    expect(r.success).toBe(false)
  })

  it('⚠ recusa o slug `todas` — é a sentinela do filtro, e /pendencias filtra por slug', () => {
    const r = filialSchema.safeParse({ nome: 'Todas', slug: 'todas' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toContain('reservado')
  })

  it('⚠ recusa o slug `geral` — é o Consolidado de /relatorios', () => {
    expect(filialSchema.safeParse({ nome: 'Geral', slug: 'geral' }).success).toBe(false)
  })

  it('os slugs reais das 5 filiais continuam válidos', () => {
    for (const slug of ['matriz', 'cd-afonso-pena', 'linhares', 'serra', 'eusebio']) {
      expect(filialSchema.safeParse({ nome: 'Fictícia', slug }).success).toBe(true)
    }
  })
})

describe('compraLoteSchema — a regra "é de cada aparelho" no SERVIDOR (F25)', () => {
  const base = {
    itens: [{ patrimonio: 'WAP0001234', service_tag: 'ABC1234' }],
    categoria: 'celular' as const,
    marca: 'MarcaFic',
    modelo: 'ModeloFic',
    filial_id: 1,
    data: '2026-08-04',
  }

  it('aceita os três campos num lote de UMA unidade', () => {
    const r = compraLoteSchema.safeParse({ ...base, imei: '000000000000000' })
    expect(r.success).toBe(true)
  })

  it('lote sem os campos passa normalmente (o caso comum)', () => {
    const dois = [
      { patrimonio: 'WAP0001234', service_tag: 'ABC1234' },
      { patrimonio: 'WAP0001235', service_tag: 'ABC1235' },
    ]
    expect(compraLoteSchema.safeParse({ ...base, itens: dois }).success).toBe(true)
  })

  it('⚠ RECUSA os campos num lote de 2+ — senão o mesmo IMEI iria para todos', () => {
    const dois = [
      { patrimonio: 'WAP0001234', service_tag: 'ABC1234' },
      { patrimonio: 'WAP0001235', service_tag: 'ABC1235' },
    ]
    const r = compraLoteSchema.safeParse({ ...base, itens: dois, imei: '000000000000000' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toContain('de cada aparelho')
  })

  it('⚠ RECUSA os campos em categoria que não é celular', () => {
    const r = compraLoteSchema.safeParse({
      ...base,
      categoria: 'notebook' as const,
      imei: '000000000000000',
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toContain('apenas para a categoria Celular')
  })
})
