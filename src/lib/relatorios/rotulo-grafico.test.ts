import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATUS_CHART_COLOR, type StatusAtivo } from '@/lib/dominio'
import {
  BRAND_AZUL,
  FRACAO_MINIMA_ROTULO,
  MAX_PONTOS_COM_ROTULO,
  contrasteWcag,
  deveRotularSegmento,
  fillRotuloSegmento,
  luminanciaRelativa,
  mostrarRotulosDaSerie,
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
  // F32/RV-02 — três matizes trocados por medição de daltonismo (o par
  // triagem × manutenção media ΔE 1,6 sob deutanopia). Estas três linhas são a
  // MEDIÇÃO NOVA, não um afrouxamento: o teste continua exigindo ≥4,5:1 na cor
  // escolhida, e foi ele que provou que as três seguem legíveis.
  //   · reservado #7c3aed → #6d28d9: mais escuro, o rótulo continua branco.
  //   · emprestado #0891b2 → #06b6d4: mais claro, o rótulo continua preto.
  //   · em_triagem #ea580c → #db2777: VIROU o rótulo de preto para branco — e é
  //     o caso mais apertado da tabela (4,60 branco × 4,57 preto). Os dois lados
  //     passam de AA; o seletor pega o maior, e por isso o valor não pode ser
  //     "arredondado à mão" aqui: qualquer repintada devolve a decisão ao teste.
  { status: 'reservado', branco: 7.1, preto: 2.96, fill: 'fill-white' },
  { status: 'em_uso', branco: 4.42, preto: 4.76, fill: 'fill-black' },
  { status: 'emprestado', branco: 2.43, preto: 8.65, fill: 'fill-black' },
  { status: 'em_triagem', branco: 4.6, preto: 4.57, fill: 'fill-white' },
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

// F29/REL-06a — o corte do rótulo do segmento empilhado desceu de "≥2" para
// "≥1 se a barra comportar". O que decide o "comportar" é a fração da barra mais
// longa, não o valor absoluto.
describe('deveRotularSegmento', () => {
  it('rotula o segmento de valor 1 quando ele é grande o bastante na escala', () => {
    // 1 em 10 = 10% da barra mais longa: cabe.
    expect(deveRotularSegmento(1, 10)).toBe(true)
  })

  it('cala o segmento pequeno demais, que sairia por cima do vizinho', () => {
    // 1 em 400 = 0,25% da largura: o número não cabe no próprio segmento.
    expect(deveRotularSegmento(1, 400)).toBe(false)
    expect(deveRotularSegmento(3, 400)).toBe(false)
  })

  it('o corte é exatamente FRACAO_MINIMA_ROTULO (inclusive)', () => {
    expect(deveRotularSegmento(4, 100)).toBe(true) // 4% — passa
    expect(deveRotularSegmento(3, 100)).toBe(false) // 3% — não
    expect(FRACAO_MINIMA_ROTULO).toBe(0.04)
  })

  it('zero e negativo nunca recebem rótulo', () => {
    expect(deveRotularSegmento(0, 10)).toBe(false)
    expect(deveRotularSegmento(-2, 10)).toBe(false)
  })

  it('entrada degenerada não quebra nem rotula', () => {
    expect(deveRotularSegmento(5, 0)).toBe(false)
    expect(deveRotularSegmento(Number.NaN, 10)).toBe(false)
    expect(deveRotularSegmento(5, Number.NaN)).toBe(false)
  })

  it('é mais permissivo que o corte antigo: o valor 1 volta a aparecer', () => {
    // A regressão que este item conserta: com `n >= 2`, um segmento de 1 ficava
    // sem rótulo E sem tooltip — ilegível em canal nenhum.
    expect(deveRotularSegmento(1, 20)).toBe(true)
  })
})

describe('mostrarRotulosDaSerie', () => {
  it('mantém os rótulos numa semana (7 pontos) e num mês por semana', () => {
    expect(mostrarRotulosDaSerie(7)).toBe(true)
    expect(mostrarRotulosDaSerie(12)).toBe(true)
  })

  it('esconde a partir de 21 pontos, onde os rótulos colidem', () => {
    expect(mostrarRotulosDaSerie(MAX_PONTOS_COM_ROTULO)).toBe(true)
    expect(mostrarRotulosDaSerie(MAX_PONTOS_COM_ROTULO + 1)).toBe(false)
    expect(mostrarRotulosDaSerie(365)).toBe(false)
  })
})
