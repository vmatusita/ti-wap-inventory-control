import { describe, expect, it } from 'vitest'
import {
  MAX_PONTOS_SERIE_ESTADO,
  MAX_SEMANAS_SERIE_ESTADO,
  MIN_PONTOS_SERIE_ESTADO,
  datasDaSerieEstado,
  montarPontosEstado,
} from '@/lib/relatorios/serie-estado'

// Calendário de referência (conferido): 01/08/2026 é um SÁBADO, e daí em diante
// 08, 15, 22 e 29/08 também são sábados.

describe('datasDaSerieEstado — onde os pontos caem', () => {
  it('marca os sábados dentro do período e fecha no fim dele', () => {
    expect(datasDaSerieEstado({ de: '2026-07-01', ate: '2026-08-10' })).toEqual([
      '2026-07-04',
      '2026-07-11',
      '2026-07-18',
      '2026-07-25',
      '2026-08-01',
      '2026-08-08',
      '2026-08-10',
    ])
  })

  it('não duplica o fim do período quando ele JÁ é um sábado', () => {
    const datas = datasDaSerieEstado({ de: '2026-07-01', ate: '2026-08-08' })
    expect(datas[datas.length - 1]).toBe('2026-08-08')
    expect(datas.filter((d) => d === '2026-08-08')).toHaveLength(1)
  })

  it('respeita o teto de leituras as-of por render, mesmo em "Tudo"', () => {
    const datas = datasDaSerieEstado({ de: '2000-01-01', ate: '2026-08-10' })
    expect(datas).toHaveLength(MAX_PONTOS_SERIE_ESTADO)
    expect(datas).toHaveLength(MAX_SEMANAS_SERIE_ESTADO + 1)
    // São as últimas semanas, não as primeiras: um período longo interessa pelo
    // que está acontecendo agora. Teto caiu de 8 para 6 semanas (F32-pós, ACHADO
    // 7) — com `ate = 2026-08-10` os 6 sábados mais recentes são 04/07 a 08/08.
    expect(datas[0]).toBe('2026-07-04')
    expect(datas[datas.length - 1]).toBe('2026-08-10')
  })

  it('o preset padrão "Esta semana" não junta pontos suficientes — o card não aparece', () => {
    // Domingo 09/08 → segunda 10/08: nenhum sábado fechou dentro da janela.
    expect(datasDaSerieEstado({ de: '2026-08-09', ate: '2026-08-10' })).toEqual(['2026-08-10'])
    // Mesmo a semana inteira dom→sáb dá 1 sábado, que É o fim do período: 1 ponto.
    expect(datasDaSerieEstado({ de: '2026-08-02', ate: '2026-08-08' })).toEqual(['2026-08-08'])
    expect(datasDaSerieEstado({ de: '2026-08-02', ate: '2026-08-08' }).length).toBeLessThan(
      MIN_PONTOS_SERIE_ESTADO,
    )
  })

  it('"Últimos 30 dias" rende curva de sobra', () => {
    const datas = datasDaSerieEstado({ de: '2026-07-12', ate: '2026-08-10' })
    expect(datas.length).toBeGreaterThanOrEqual(MIN_PONTOS_SERIE_ESTADO)
    expect(datas).toEqual(['2026-07-18', '2026-07-25', '2026-08-01', '2026-08-08', '2026-08-10'])
  })

  it('período de um dia devolve só ele', () => {
    expect(datasDaSerieEstado({ de: '2026-08-10', ate: '2026-08-10' })).toEqual(['2026-08-10'])
  })

  it('período invertido ou incompleto devolve vazio, sem lançar', () => {
    expect(datasDaSerieEstado({ de: '2026-08-10', ate: '2026-08-01' })).toEqual([])
    expect(datasDaSerieEstado({ de: '', ate: '2026-08-10' })).toEqual([])
    expect(datasDaSerieEstado({ de: '2026-08-01', ate: '' })).toEqual([])
  })

  it('data malformada devolve vazio em vez de gerar pontos inválidos', () => {
    expect(datasDaSerieEstado({ de: 'ontem', ate: 'hoje' })).toEqual([])
  })

  it('nunca sai do intervalo pedido', () => {
    const periodo = { de: '2026-05-13', ate: '2026-08-10' }
    for (const d of datasDaSerieEstado(periodo)) {
      expect(d >= periodo.de).toBe(true)
      expect(d <= periodo.ate).toBe(true)
    }
  })

  it('devolve as datas em ordem crescente', () => {
    const datas = datasDaSerieEstado({ de: '2026-06-01', ate: '2026-08-10' })
    expect(datas).toEqual([...datas].sort())
  })
})

describe('montarPontosEstado — o rótulo congela junto com o ponto', () => {
  it('rotula em dd/MM e casa cada data com a sua contagem', () => {
    expect(montarPontosEstado(['2026-08-01', '2026-08-08'], [120, 97])).toEqual([
      { chave: '2026-08-01', rotulo: '01/08', em_estoque: 120 },
      { chave: '2026-08-08', rotulo: '08/08', em_estoque: 97 },
    ])
  })

  it('contagem faltando vira zero em vez de undefined no JSON congelado', () => {
    expect(montarPontosEstado(['2026-08-01'], [])).toEqual([
      { chave: '2026-08-01', rotulo: '01/08', em_estoque: 0 },
    ])
  })
})
