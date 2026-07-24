import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATUS_CHART_COLOR, type StatusAtivo } from '@/lib/dominio'
import {
  BRAND_AZUL,
  contrasteWcag,
  fillRotuloSegmento,
  luminanciaRelativa,
} from './rotulo-grafico'

const BRANCO = '#ffffff'
const PRETO = '#000000'

// Os 7 status que aparecem no gráfico empilhado (descartado e
// devolvido_fornecedor ficam de fora — ver `barras-empilhadas.tsx`), com o
// contraste medido de cada um contra branco e contra preto. Travados aqui: se
// alguém repintar um status, o teste diz na hora se o rótulo ainda é legível.
const MEDIDAS: {
  status: StatusAtivo
  branco: number
  preto: number
  fill: string
}[] = [
  { status: 'em_estoque', branco: 3.3, preto: 6.37, fill: 'fill-black' },
  { status: 'reservado', branco: 5.7, preto: 3.69, fill: 'fill-white' },
  { status: 'em_uso', branco: 4.42, preto: 4.76, fill: 'fill-black' },
  { status: 'emprestado', branco: 3.68, preto: 5.7, fill: 'fill-black' },
  { status: 'em_triagem', branco: 3.56, preto: 5.9, fill: 'fill-black' },
  { status: 'em_manutencao', branco: 3.19, preto: 6.59, fill: 'fill-black' },
  { status: 'defasado', branco: 2.54, preto: 8.27, fill: 'fill-black' },
]

describe('luminanciaRelativa', () => {
  it('branco = 1 e preto = 0 (extremos da WCAG)', () => {
    expect(luminanciaRelativa(BRANCO)).toBeCloseTo(1, 5)
    expect(luminanciaRelativa(PRETO)).toBeCloseTo(0, 5)
  })

  it('aceita a forma curta (#abc = #aabbcc)', () => {
    expect(luminanciaRelativa('#fff')).toBeCloseTo(luminanciaRelativa('#ffffff'), 5)
  })

  it('entrada que não é cor vale preto (rótulo cai em branco)', () => {
    expect(luminanciaRelativa('var(--nao-existe)')).toBe(0)
    expect(fillRotuloSegmento('var(--nao-existe)')).toBe('fill-white')
  })
})

describe('contrasteWcag', () => {
  it('preto × branco = 21:1 (máximo)', () => {
    expect(contrasteWcag(PRETO, BRANCO)).toBeCloseTo(21, 5)
  })

  it('cor com ela mesma = 1:1 e a ordem dos argumentos não importa', () => {
    expect(contrasteWcag(BRAND_AZUL, BRAND_AZUL)).toBeCloseTo(1, 5)
    expect(contrasteWcag(BRAND_AZUL, BRANCO)).toBeCloseTo(contrasteWcag(BRANCO, BRAND_AZUL), 5)
  })
})

describe('contraste dos segmentos do gráfico empilhado', () => {
  for (const m of MEDIDAS) {
    it(`${m.status}: branco ${m.branco}:1 · preto ${m.preto}:1`, () => {
      const cor = STATUS_CHART_COLOR[m.status]
      expect(contrasteWcag(cor, BRANCO)).toBeCloseTo(m.branco, 1)
      expect(contrasteWcag(cor, PRETO)).toBeCloseTo(m.preto, 1)
    })

    it(`${m.status}: rótulo ${m.fill}, com pelo menos 4,5:1`, () => {
      const cor = STATUS_CHART_COLOR[m.status]
      expect(fillRotuloSegmento(cor)).toBe(m.fill)
      const escolhida = m.fill === 'fill-white' ? BRANCO : PRETO
      expect(contrasteWcag(cor, escolhida)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('BRAND_AZUL', () => {
  // O `em_uso` é o único status cuja cor é token CSS (`var(--color-brand-azul)`),
  // e este módulo puro não tem CSSOM para resolvê-la — copia o valor. Se o token
  // do globals.css mudar sem a cópia mudar junto, o gráfico apodreceria calado
  // (rótulo escolhido para a cor errada); aqui ele quebra o teste.
  it('é o mesmo hex de --brand-azul no globals.css', () => {
    const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
    const m = /--brand-azul:\s*([^;]+);/.exec(css)
    expect(m?.[1]?.trim()).toBe(BRAND_AZUL)
  })

  it('o token de STATUS_CHART_COLOR.em_uso resolve para ele', () => {
    expect(luminanciaRelativa(STATUS_CHART_COLOR.em_uso)).toBeCloseTo(
      luminanciaRelativa(BRAND_AZUL),
      10,
    )
  })
})
