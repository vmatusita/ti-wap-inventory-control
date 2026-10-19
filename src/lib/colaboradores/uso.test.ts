import { describe, expect, it } from 'vitest'
import {
  casaFiltroDeUso,
  ehFiltroDeUso,
  FILTROS_DE_USO,
  porqueSemUso,
  type UsoDoColaborador,
} from '@/lib/colaboradores/uso'

// v1.71.2 — o texto do selo "Sem uso" e o filtro "Uso" de Administração › Colaboradores. Os NÚMEROS vêm prontos do
// banco (`colaboradores_uso_efetivo()`, 0180); aqui só o texto e a decisão de filtro.

const uso = (parcial: Partial<UsoDoColaborador>): UsoDoColaborador => ({
  usoEfetivo: false,
  semUso: false,
  registrosValidos: 0,
  registrosEstornados: 0,
  ativosComAPessoa: 0,
  ...parcial,
})

describe('porqueSemUso — o porquê do selo, em linguagem de operador', () => {
  it('zero registro: "nunca usado"', () => {
    expect(porqueSemUso(0)).toBe('nunca usado')
  })
  it('um registro: singular', () => {
    expect(porqueSemUso(1)).toBe('1 registro, estornado')
  })
  it('vários: "N registros, todos estornados", com milhar pt-BR', () => {
    expect(porqueSemUso(3)).toBe('3 registros, todos estornados')
    expect(porqueSemUso(1200)).toBe('1.200 registros, todos estornados')
  })
})

describe('casaFiltroDeUso', () => {
  const semUso = uso({ semUso: true, registrosEstornados: 2 })
  const emUso = uso({ usoEfetivo: true, registrosValidos: 1 })
  const inativoNuncaUsado = uso({})

  it('"todos" mostra todo mundo, inclusive sem o uso calculado', () => {
    for (const u of [semUso, emUso, inativoNuncaUsado, null]) expect(casaFiltroDeUso(u, 'todos')).toBe(true)
  })
  it('"Sem uso" é o selo (cadastro ativo sem uso efetivo)', () => {
    expect(casaFiltroDeUso(semUso, 'sem-uso')).toBe(true)
    expect(casaFiltroDeUso(emUso, 'sem-uso')).toBe(false)
    expect(casaFiltroDeUso(inativoNuncaUsado, 'sem-uso')).toBe(false)
  })
  it('"Em uso" é quem tem uso efetivo; o inativo nunca usado não está em nenhum dos dois', () => {
    expect(casaFiltroDeUso(emUso, 'em-uso')).toBe(true)
    expect(casaFiltroDeUso(semUso, 'em-uso')).toBe(false)
    expect(casaFiltroDeUso(inativoNuncaUsado, 'em-uso')).toBe(false)
  })
  it('sem o uso calculado (a leitura falhou), a linha só aparece em "todos"', () => {
    expect(casaFiltroDeUso(null, 'em-uso')).toBe(false)
    expect(casaFiltroDeUso(null, 'sem-uso')).toBe(false)
  })
})

describe('FILTROS_DE_USO', () => {
  it('as três opções, na ordem da tela', () => {
    expect(FILTROS_DE_USO.map((f) => f.rotulo)).toEqual(['Uso: todos', 'Em uso', 'Sem uso'])
  })
  it('ehFiltroDeUso só aceita os três valores', () => {
    expect(['todos', 'em-uso', 'sem-uso'].every(ehFiltroDeUso)).toBe(true)
    expect(ehFiltroDeUso('qualquer')).toBe(false)
  })
})
