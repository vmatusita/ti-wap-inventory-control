import { describe, expect, it } from 'vitest'

import { STATUS_CHART_COLOR } from '@/lib/dominio'
import { TOKEN_PARA_HEX } from '@/lib/relatorios/rotulo-grafico'
import {
  ALIVIOS,
  PISO_CVD_MINIMO,
  PISO_NORMAL,
  STATUS_VIVOS,
  VISOES,
  avaliarPortao,
  chavePar,
  deltaE,
  descreverAliviosVencidos,
  descreverViolacoes,
  pares,
  type Visao,
} from '@/lib/relatorios/paleta-graficos'

// Passo 5 · item AA (22/09/2026) — o PORTÃO de ΔE da paleta de gráfico.
//
// Regra deste arquivo: nenhum número aqui é reinventado. As entradas de
// ALIVIOS e os valores de referência abaixo vêm de `docs/aa-evidencias/medir.mjs`,
// conferidos por uma reimplementação independente na revisão — mesma paleta,
// mesmos 21 pares, mesmas 4 visões, bateram na 2ª casa decimal.

// A paleta REAL: o mesmo caminho que a tela usa. `STATUS_CHART_COLOR` aponta
// para `var(--grafico-*)`, `TOKEN_PARA_HEX` resolve para o hex — a mesma
// travessia que `src/lib/dominio/cores.test.ts` §4 já prova sincronizada com
// `globals.css`. Este teste não relê o CSS de novo (a ordem pediu para não
// duplicar essa leitura sem necessidade); ele confia na trava da §4 e mede a
// partir do hex que ela já garante correto.
function hexReal(status: (typeof STATUS_VIVOS)[number]): string {
  const token = STATUS_CHART_COLOR[status]
  const hex = TOKEN_PARA_HEX[token]
  if (!hex) {
    throw new Error(`paleta-graficos.test: ${status} -> ${token} sem hex em TOKEN_PARA_HEX`)
  }
  return hex
}

const PALETA_REAL: Partial<Record<(typeof STATUS_VIVOS)[number], string>> = Object.fromEntries(
  STATUS_VIVOS.map((s) => [s, hexReal(s)]),
)

describe('o método (ΔE em OKLab sob simulação Machado 2009) — valores conhecidos', () => {
  it('ΔE de uma cor para ela mesma é 0, nas 4 visões', () => {
    for (const visao of VISOES) {
      expect(deltaE('#2a78d6', '#2a78d6', visao)).toBe(0)
      expect(deltaE('#9ca3af', '#9ca3af', visao)).toBe(0)
    }
  })

  // Pares que `docs/aa-evidencias/resultado.json` publica para a paleta ATUAL —
  // prova que esta reimplementação bate com a medição que fundamentou a
  // decisão do Johnny, na 2ª casa decimal.
  it.each([
    ['em_estoque', 'reservado', 'normal', 41.41],
    ['emprestado', 'defasado', 'normal', 11.33],
    ['emprestado', 'defasado', 'protanopia', 5.63],
    ['em_estoque', 'em_uso', 'tritanopia', 6.26],
  ] as const)(
    '%s × %s sob %s ≈ ΔE %s (docs/aa-evidencias/resultado.json)',
    (a, b, visao: Visao, esperado) => {
      const medido = deltaE(hexReal(a), hexReal(b), visao)
      expect(Number(medido.toFixed(2))).toBeCloseTo(esperado, 2)
    },
  )
})

describe('os 21 pares — geração', () => {
  it('os 7 status vivos geram C(7,2) = 21 pares, sem repetir', () => {
    const todos = pares()
    expect(todos).toHaveLength(21)
    expect(new Set(todos.map(chavePar)).size).toBe(21)
  })

  it('descartado e devolvido_fornecedor nao entram em par nenhum (FORA_DO_ACERVO)', () => {
    const nomes = pares()
      .flat()
      .flat()
    expect(nomes).not.toContain('descartado')
    expect(nomes).not.toContain('devolvido_fornecedor')
  })
})

describe('o portão sobre a paleta REAL de STATUS_CHART_COLOR (decisão: MANTER)', () => {
  const resultado = avaliarPortao(PALETA_REAL)

  it('nenhum par cai abaixo do piso sem alívio registrado', () => {
    expect(
      resultado.semAlivio,
      descreverViolacoes('par(es) abaixo do piso sem alívio registrado em ALIVIOS', resultado.semAlivio),
    ).toEqual([])
  })

  it('nenhum alívio registrado piorou além da tolerância (0,01)', () => {
    expect(
      resultado.aliviosPioraram,
      descreverViolacoes('alívio(s) cujo valor medido piorou além do registrado', resultado.aliviosPioraram),
    ).toEqual([])
  })

  it('nenhum alívio ficou vencido (o par já passaria do piso hoje)', () => {
    expect(resultado.aliviosVencidos, descreverAliviosVencidos(resultado.aliviosVencidos)).toEqual([])
  })

  it('o portão fecha OK', () => {
    expect(resultado.ok).toBe(true)
  })

  it('os 2 alívios registrados são exatamente os 2 pontos abaixo do piso da paleta atual', () => {
    expect(ALIVIOS).toHaveLength(2)
    for (const al of ALIVIOS) {
      expect(al.par).toBe('emprestado×defasado')
      expect(al.data).toBe('22/09/2026')
    }
    expect(ALIVIOS.map((al) => al.visao).sort()).toEqual(['normal', 'protanopia'])
  })

  // Os dois pares "perto do piso" que o levantamento achou (não bloqueiam,
  // ficam como observação — relatorio.md §2.1 item 3): confirma que HOJE eles
  // passam do mínimo (6), com folga pequena, sem entrar em ALIVIOS.
  it('em_estoque×em_manutencao (protanopia) e em_estoque×em_triagem (deuteranopia) passam do mínimo, por pouco', () => {
    const protan = deltaE(hexReal('em_estoque'), hexReal('em_manutencao'), 'protanopia')
    const deutan = deltaE(hexReal('em_estoque'), hexReal('em_triagem'), 'deuteranopia')
    expect(protan).toBeGreaterThanOrEqual(PISO_CVD_MINIMO)
    expect(protan).toBeLessThan(PISO_CVD_MINIMO + 0.5)
    expect(deutan).toBeGreaterThanOrEqual(PISO_CVD_MINIMO)
    expect(deutan).toBeLessThan(PISO_CVD_MINIMO + 0.5)
  })
})

describe('pisos', () => {
  it('normal e o piso duro de 15; CVD o mínimo duro de 6', () => {
    expect(PISO_NORMAL).toBe(15)
    expect(PISO_CVD_MINIMO).toBe(6)
  })
})
