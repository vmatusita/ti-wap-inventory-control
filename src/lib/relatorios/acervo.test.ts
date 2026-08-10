import { describe, expect, it } from 'vitest'
import { STATUS_ORDEM } from '@/lib/dominio'
import { agregarAcervoPorSituacao } from '@/lib/relatorios/acervo'
import type { EstoqueCatStatus } from '@/lib/relatorios/tipos'

// Dados 100% fictícios (CLAUDE.md).
const DADOS: EstoqueCatStatus[] = [
  {
    categoria: 'notebook',
    segmentos: [
      { status: 'em_uso', total: 10 },
      { status: 'em_estoque', total: 4 },
      { status: 'em_manutencao', total: 1 },
    ],
    total: 15,
  },
  {
    categoria: 'monitor',
    segmentos: [
      { status: 'em_uso', total: 7 },
      { status: 'em_estoque', total: 2 },
    ],
    total: 9,
  },
]

describe('agregarAcervoPorSituacao', () => {
  it('soma o mesmo status por todas as categorias', () => {
    const r = agregarAcervoPorSituacao(DADOS)
    expect(r.segmentos.find((s) => s.status === 'em_uso')?.total).toBe(17)
    expect(r.segmentos.find((s) => s.status === 'em_estoque')?.total).toBe(6)
    expect(r.segmentos.find((s) => s.status === 'em_manutencao')?.total).toBe(1)
  })

  it('o total é a soma dos totais das categorias — a barra não inventa nem perde ativo', () => {
    const r = agregarAcervoPorSituacao(DADOS)
    expect(r.total).toBe(DADOS.reduce((t, d) => t + d.total, 0))
    expect(r.total).toBe(24)
  })

  it('devolve os segmentos na ordem canônica de STATUS_ORDEM', () => {
    const r = agregarAcervoPorSituacao([
      {
        categoria: 'celular',
        // De propósito fora de ordem na entrada.
        segmentos: [
          { status: 'em_manutencao', total: 2 },
          { status: 'em_estoque', total: 3 },
          { status: 'em_uso', total: 1 },
        ],
        total: 6,
      },
    ])
    const posicoes = r.segmentos.map((s) => STATUS_ORDEM.indexOf(s.status))
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b))
    expect(r.segmentos.map((s) => s.status)).toEqual([
      'em_estoque',
      'em_uso',
      'em_manutencao',
    ])
  })

  it('omite status zerado — segmento invisível só polui a legenda', () => {
    const r = agregarAcervoPorSituacao([
      {
        categoria: 'tablet',
        segmentos: [
          { status: 'em_uso', total: 3 },
          { status: 'reservado', total: 0 },
        ],
        total: 3,
      },
    ])
    expect(r.segmentos.map((s) => s.status)).toEqual(['em_uso'])
  })

  it('ignora as baixas (descartado e devolvido ao fornecedor), como as empilhadas', () => {
    const r = agregarAcervoPorSituacao([
      {
        categoria: 'desktop',
        segmentos: [
          { status: 'em_uso', total: 5 },
          { status: 'descartado', total: 40 },
          { status: 'devolvido_fornecedor', total: 9 },
        ],
        total: 5,
      },
    ])
    expect(r.segmentos.map((s) => s.status)).toEqual(['em_uso'])
    expect(r.total).toBe(5)
  })

  it('lista vazia devolve acervo vazio (o card não renderiza)', () => {
    expect(agregarAcervoPorSituacao([])).toEqual({ segmentos: [], total: 0 })
  })
})
