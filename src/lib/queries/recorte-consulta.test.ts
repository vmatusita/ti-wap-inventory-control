import { describe, expect, it } from 'vitest'
import { efetivar, RECORTE_UNIVERSAL, type RecorteDeLeitura } from '@/lib/auth/recorte-leitura'
import { recortarPorUnidade } from '@/lib/queries/recorte-consulta'

// F57 · Frente H — a tradução de `UnidadesEfetivas` em filtro, gravada por um builder falso.
// Filiais 100% fictícias.

type Chamada = [string, ...unknown[]]

function builderQueGrava() {
  const chamadas: Chamada[] = []
  const builder: Record<string, (...args: unknown[]) => unknown> = {}
  for (const metodo of ['in', 'is', 'not', 'or']) {
    builder[metodo] = (...args: unknown[]) => {
      chamadas.push([metodo, ...args])
      return builder
    }
  }
  return { builder, chamadas }
}

const RESTRITO: RecorteDeLeitura = {
  alcance: 'restrito',
  unidades: [{ id: 1, slug: 'alfa' }],
  alcancaSemUnidade: false,
}

describe('recortarPorUnidade — um filtro para cada modo, e nenhum modo sem filtro', () => {
  it('`todas` não aplica filtro nenhum', () => {
    const { builder, chamadas } = builderQueGrava()
    recortarPorUnidade(builder, 'filial_id', efetivar(RECORTE_UNIVERSAL, { familia: 'id', modo: 'todas' }))
    expect(chamadas).toEqual([])
  })

  it('`lista` vira `.in` na coluna da unidade', () => {
    const { builder, chamadas } = builderQueGrava()
    recortarPorUnidade(
      builder,
      'filial_id',
      efetivar(RECORTE_UNIVERSAL, { familia: 'id', modo: 'lista', ids: [2, 4] }),
    )
    expect(chamadas).toEqual([['in', 'filial_id', [2, 4]]])
  })

  it('`lista` com o terceiro valor vira um OR — nunca `.is` e `.in` somados na mesma coluna', () => {
    const { builder, chamadas } = builderQueGrava()
    recortarPorUnidade(
      builder,
      'filial',
      efetivar(RECORTE_UNIVERSAL, {
        familia: 'slug',
        modo: 'lista',
        slugs: ['bravo'],
        incluiSemUnidade: true,
      }),
    )
    expect(chamadas).toEqual([['or', 'filial.is.null,filial.in.(bravo)']])
  })

  it('`somente-sem-unidade` é o `.is(null)`', () => {
    const { builder, chamadas } = builderQueGrava()
    recortarPorUnidade(
      builder,
      'filial',
      efetivar(RECORTE_UNIVERSAL, { familia: 'slug', modo: 'lista', slugs: [], incluiSemUnidade: true }),
    )
    expect(chamadas).toEqual([['is', 'filial', null]])
  })

  it('`nenhuma` — a interseção vazia — é um filtro GARANTIDAMENTE falso, e não a ausência de filtro', () => {
    // É exatamente o fail-open da convenção antiga: a lista esvaziou e a query devolvia tudo.
    const { builder, chamadas } = builderQueGrava()
    recortarPorUnidade(
      builder,
      'filial_id',
      efetivar(RESTRITO, { familia: 'id', modo: 'lista', ids: [3] }),
    )
    expect(chamadas).toEqual([
      ['is', 'filial_id', null],
      ['not', 'filial_id', 'is', null],
    ])
  })

  it('o OR recusa um valor que mudaria a gramática do filtro', () => {
    const { builder } = builderQueGrava()
    const u = efetivar(RECORTE_UNIVERSAL, {
      familia: 'slug',
      modo: 'lista',
      slugs: ['bravo),filial.not.is.null'],
      incluiSemUnidade: true,
    })
    expect(() => recortarPorUnidade(builder, 'filial', u)).toThrow(/fora do formato/)
  })
})
