import { describe, expect, it } from 'vitest'
import {
  chipManutencaoParada,
  manutencaoEmAlerta,
  MANUTENCAO_ALERTA_DIAS,
} from './manutencao-alerta'

describe('MANUTENCAO_ALERTA_DIAS', () => {
  it('é 30', () => {
    expect(MANUTENCAO_ALERTA_DIAS).toBe(30)
  })
})

describe('manutencaoEmAlerta', () => {
  it('aberto com dias no limiar (30) alerta', () => {
    expect(manutencaoEmAlerta({ diasEmManutencao: 30, fechado: false })).toBe(true)
  })

  it('aberto com mais que o limiar alerta', () => {
    expect(manutencaoEmAlerta({ diasEmManutencao: 45, fechado: false })).toBe(true)
  })

  it('aberto abaixo do limiar (29) NÃO alerta', () => {
    expect(manutencaoEmAlerta({ diasEmManutencao: 29, fechado: false })).toBe(false)
  })

  it('caso FECHADO nunca alerta, mesmo com muitos dias', () => {
    expect(manutencaoEmAlerta({ diasEmManutencao: 99, fechado: true })).toBe(false)
  })

  it('dias nulo (sem envio conhecido) nunca alerta', () => {
    expect(manutencaoEmAlerta({ diasEmManutencao: null, fechado: false })).toBe(false)
  })
})

describe('chipManutencaoParada', () => {
  it('nenhum caso em alerta → null (sem chip vazio)', () => {
    expect(
      chipManutencaoParada([
        { diasEmManutencao: 10, fechado: false },
        { diasEmManutencao: 99, fechado: true },
        { diasEmManutencao: null, fechado: false },
      ]),
    ).toBeNull()
  })

  it('conta só os casos abertos ≥ 30 dias', () => {
    const chip = chipManutencaoParada([
      { diasEmManutencao: 40, fechado: false }, // alerta
      { diasEmManutencao: 30, fechado: false }, // alerta (limiar)
      { diasEmManutencao: 29, fechado: false }, // não
      { diasEmManutencao: 60, fechado: true }, // fechado, não
    ])
    expect(chip).toEqual({
      chave: 'manutencao_parada',
      rotulo: 'Manutenção parada (30+ dias)',
      total: 2,
    })
  })

  it('array vazio → null', () => {
    expect(chipManutencaoParada([])).toBeNull()
  })
})
