import { describe, expect, it } from 'vitest'
import { marcaEstorno } from './estorno'

describe('marcaEstorno', () => {
  it('não estornada: undefined → objeto vazio (nenhum campo no spread)', () => {
    expect(marcaEstorno(undefined)).toEqual({})
  })

  it('não estornada: null → objeto vazio', () => {
    expect(marcaEstorno(null)).toEqual({})
  })

  it('não estornada: string vazia → objeto vazio (não marca)', () => {
    expect(marcaEstorno('')).toEqual({})
  })

  it('estornada: data presente → estornada:true + estornoData', () => {
    expect(marcaEstorno('2026-07-20')).toEqual({
      estornada: true,
      estornoData: '2026-07-20',
    })
  })

  it('o spread de uma marca vazia não adiciona chaves à linha', () => {
    const linha = { id: 'm1', patrimonio: 'WAP0001234', ...marcaEstorno(undefined) }
    expect('estornada' in linha).toBe(false)
    expect('estornoData' in linha).toBe(false)
  })

  it('o spread de uma marca cheia adiciona as duas chaves', () => {
    const linha = { id: 'm1', patrimonio: 'WAP0001234', ...marcaEstorno('2026-07-21') }
    expect(linha).toMatchObject({ estornada: true, estornoData: '2026-07-21' })
  })
})
