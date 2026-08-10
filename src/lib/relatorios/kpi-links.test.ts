import { describe, expect, it } from 'vitest'
import { linksKpiAtivos, recorteFilialAtivos } from './kpi-links'

describe('linksKpiAtivos', () => {
  // F25 — o consolidado passou a declarar `&filial=todas` EXPLICITAMENTE. Antes
  // ele omitia o param, e a omissão passou a significar "o padrão do CARGO": um
  // operador clicaria num tile que soma todas as filiais e cairia numa lista
  // recortada nas dele. A sentinela faz o destino bater com o número do tile.
  it('consolidado (filialId null): declara &filial=todas em todos os links', () => {
    const l = linksKpiAtivos(null)
    for (const href of Object.values(l)) expect(href).toContain('&filial=todas')
  })

  it('filial específica: acrescenta &filial=<id> a cada link', () => {
    const l = linksKpiAtivos(7)
    for (const href of Object.values(l)) expect(href).toContain('&filial=7')
  })

  it('cada tile aponta para /ativos filtrado pelo status certo', () => {
    const l = linksKpiAtivos(null)
    expect(l.em_uso).toBe('/ativos?status=em_uso&filial=todas')
    expect(l.em_estoque).toBe('/ativos?status=em_estoque&filial=todas')
    expect(l.reservado).toBe('/ativos?status=reservado&filial=todas')
    expect(l.em_triagem).toBe('/ativos?status=em_triagem&filial=todas')
    expect(l.em_manutencao).toBe('/ativos?status=em_manutencao&filial=todas')
    expect(l.defasado).toBe('/ativos?status=defasado&filial=todas')
    expect(l.emprestado).toBe('/ativos?status=emprestado&filial=todas')
  })

  it('"total" lista os 7 status somados pelo KPI (exclui as baixas)', () => {
    const l = linksKpiAtivos(null)
    expect(l.total).toBe(
      '/ativos?status=em_estoque,reservado,em_uso,emprestado,em_triagem,em_manutencao,defasado&filial=todas',
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

// F32/RV-12 — `recorteFilialAtivos` é o pedaço extraído de `linksKpiAtivos` que
// `urlAtivosPorSegmento` (cliques-grafico.ts) reusa para o clique nos segmentos
// das barras empilhadas. Mesma sentinela, mesma razão (ver o comentário acima
// de `linksKpiAtivos` em kpi-links.ts): sem ela o consolidado "esqueceria" de
// declarar `&filial=todas` e o clique cairia no padrão do CARGO, não no total
// que o segmento mostrou.
describe('recorteFilialAtivos', () => {
  it('consolidado (null): devolve a sentinela &filial=todas', () => {
    expect(recorteFilialAtivos(null)).toBe('&filial=todas')
  })

  it('filial específica: devolve &filial=<id>', () => {
    expect(recorteFilialAtivos(7)).toBe('&filial=7')
  })

  it('linksKpiAtivos usa exatamente o que recorteFilialAtivos devolve', () => {
    const l = linksKpiAtivos(3)
    expect(l.em_uso).toBe(`/ativos?status=em_uso${recorteFilialAtivos(3)}`)
  })
})
