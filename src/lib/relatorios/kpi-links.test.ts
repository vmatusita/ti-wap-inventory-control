import { describe, expect, it } from 'vitest'
import { linksKpiAtivos } from './kpi-links'

describe('linksKpiAtivos', () => {
  it('consolidado (filialId null): sem &filial em nenhum link', () => {
    const l = linksKpiAtivos(null)
    for (const href of Object.values(l)) expect(href).not.toContain('&filial=')
  })

  it('filial específica: acrescenta &filial=<id> a cada link', () => {
    const l = linksKpiAtivos(7)
    for (const href of Object.values(l)) expect(href).toContain('&filial=7')
  })

  it('cada tile aponta para /ativos filtrado pelo status certo', () => {
    const l = linksKpiAtivos(null)
    expect(l.em_uso).toBe('/ativos?status=em_uso')
    expect(l.em_estoque).toBe('/ativos?status=em_estoque')
    expect(l.reservado).toBe('/ativos?status=reservado')
    expect(l.em_triagem).toBe('/ativos?status=em_triagem')
    expect(l.em_manutencao).toBe('/ativos?status=em_manutencao')
    expect(l.defasado).toBe('/ativos?status=defasado')
    expect(l.emprestado).toBe('/ativos?status=emprestado')
  })

  it('"total" lista os 7 status somados pelo KPI (exclui as baixas)', () => {
    const l = linksKpiAtivos(null)
    expect(l.total).toBe(
      '/ativos?status=em_estoque,reservado,em_uso,emprestado,em_triagem,em_manutencao,defasado',
    )
    expect(l.total).not.toContain('descartado')
    expect(l.total).not.toContain('devolvido_fornecedor')
  })

  it('cobre os 7 tiles principais + emprestado (GrupoKpis)', () => {
    const l = linksKpiAtivos(3)
    expect(Object.keys(l).sort()).toEqual(
      [
        'defasado',
        'em_estoque',
        'em_manutencao',
        'em_triagem',
        'em_uso',
        'emprestado',
        'reservado',
        'total',
      ].sort(),
    )
  })
})
