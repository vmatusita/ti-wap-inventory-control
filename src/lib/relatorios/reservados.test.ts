import { describe, expect, it } from 'vitest'
import { CATEGORIA_ORDEM } from '@/lib/dominio'
import { agruparReservados, rotuloReservados } from '@/lib/relatorios/reservados'
import type { ItemReservado } from '@/lib/relatorios/tipos'

// v1.71.1 — o card "Reservados" separado por categoria. Dado 100% fictício (prefixo `FIC`, fora
// do formato de patrimônio da WAP; `WAP0001234` é a sentinela fictícia da casa).

const item = (patrimonio: string, categoria?: ItemReservado['categoria']): ItemReservado =>
  categoria
    ? { patrimonio, modelo: 'Modelo Fictício', chamado: null, categoria }
    : { patrimonio, modelo: 'Modelo Fictício', chamado: null }

describe('agruparReservados', () => {
  it('lista vazia: total 0 e nenhum grupo (não é "sem grupos")', () => {
    expect(agruparReservados([])).toEqual({ total: 0, grupos: [] })
  })

  it('uma categoria só: um grupo, com o total e os itens por patrimônio', () => {
    const r = agruparReservados([item('FIC0000003', 'notebook'), item('FIC0000001', 'notebook')])
    expect(r.total).toBe(2)
    expect(r.grupos).toEqual([
      {
        categoria: 'notebook',
        total: 2,
        itens: [item('FIC0000001', 'notebook'), item('FIC0000003', 'notebook')],
      },
    ])
  })

  it('várias categorias: a ordem é CATEGORIA_ORDEM — a do card "Disponíveis por modelo" —, não a de chegada nem a do enum', () => {
    // Chegam na ordem do ENUM do banco (notebook, desktop, monitor, celular): o card tem de
    // devolvê-las na de CATEGORIA_ORDEM (notebook, celular, monitor, desktop).
    const r = agruparReservados([
      item('FIC0000010', 'desktop'),
      item('FIC0000020', 'monitor'),
      item('FIC0000030', 'celular'),
      item('FIC0000040', 'notebook'),
      item('FIC0000005', 'celular'),
    ])
    expect(r.grupos?.map((g) => g.categoria)).toEqual(['notebook', 'celular', 'monitor', 'desktop'])
    const ordemDoVizinho = CATEGORIA_ORDEM.filter((c) => r.grupos?.some((g) => g.categoria === c))
    expect(r.grupos?.map((g) => g.categoria)).toEqual(ordemDoVizinho)
    expect(r.grupos?.find((g) => g.categoria === 'celular')?.itens.map((i) => i.patrimonio)).toEqual([
      'FIC0000005',
      'FIC0000030',
    ])
  })

  it('o total é a soma dos grupos, e cada grupo conta os seus itens', () => {
    const itens = [
      item('FIC0000001', 'notebook'),
      item('FIC0000002', 'notebook'),
      item('FIC0000003', 'celular'),
      item('WAP0001234', 'tablet'),
      item('FIC0000004', 'outro'),
    ]
    const r = agruparReservados(itens)
    expect(r.total).toBe(5)
    expect(r.grupos?.reduce((s, g) => s + g.total, 0)).toBe(r.total)
    for (const g of r.grupos ?? []) expect(g.total).toBe(g.itens.length)
  })

  it('UM item sem categoria (snapshot gerado antes da v1.71.1) devolve "sem grupos", com o total', () => {
    const r = agruparReservados([item('FIC0000001', 'notebook'), item('FIC0000002')])
    expect(r).toEqual({ total: 2, grupos: null })
  })

  it('nenhum item com categoria (o snapshot antigo inteiro): "sem grupos"', () => {
    expect(agruparReservados([item('FIC0000001'), item('FIC0000002')])).toEqual({ total: 2, grupos: null })
  })

  it('não muda a lista recebida (a ordem por patrimônio sai de uma cópia)', () => {
    const itens = [item('FIC0000002', 'notebook'), item('FIC0000001', 'notebook')]
    const copia = structuredClone(itens)
    agruparReservados(itens)
    expect(itens).toEqual(copia)
  })
})

describe('rotuloReservados', () => {
  it('singular e plural', () => {
    expect(rotuloReservados(0)).toBe('0 reservados')
    expect(rotuloReservados(1)).toBe('1 reservado')
    expect(rotuloReservados(2)).toBe('2 reservados')
  })

  it('milhar no formato pt-BR', () => {
    expect(rotuloReservados(1234)).toBe('1.234 reservados')
  })
})
