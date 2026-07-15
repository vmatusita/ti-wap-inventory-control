import { describe, it, expect } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import {
  granularidadeDoPeriodo,
  contarMeses,
  mesesDoIntervalo,
  rotuloMes,
  chaveSemana,
  baldesCurtos,
  montarSerieMensal,
  montarSerieCurta,
  DIAS_MAX_GRANULARIDADE_DIA,
  DIAS_MAX_GRANULARIDADE_SEMANA,
  MESES_MAX_EIXO_PREENCHIDO,
  type LinhaSerieMensal,
  type LinhaSerieCurta,
} from '@/lib/relatorios/serie'
import type { Periodo } from '@/lib/relatorios/periodo'

// Período de exatamente `dias` dias corridos a partir de `de` (INCLUSIVO): a
// duração vale `dias`, então `ate = de + (dias - 1)`.
function periodoDeDias(de: string, dias: number): Periodo {
  return { de, ate: format(addDays(parseISO(de), dias - 1), 'yyyy-MM-dd') }
}

describe('granularidadeDoPeriodo', () => {
  it('usa DIA até o limite (16 dias) e passa a SEMANA logo acima (17)', () => {
    expect(granularidadeDoPeriodo(periodoDeDias('2026-01-01', DIAS_MAX_GRANULARIDADE_DIA))).toBe('dia')
    expect(granularidadeDoPeriodo(periodoDeDias('2026-01-01', DIAS_MAX_GRANULARIDADE_DIA + 1))).toBe('semana')
  })

  it('usa SEMANA até o limite (120 dias) e passa a MÊS logo acima (121)', () => {
    expect(granularidadeDoPeriodo(periodoDeDias('2026-01-01', DIAS_MAX_GRANULARIDADE_SEMANA))).toBe('semana')
    expect(granularidadeDoPeriodo(periodoDeDias('2026-01-01', DIAS_MAX_GRANULARIDADE_SEMANA + 1))).toBe('mes')
  })

  it('trata o intervalo como inclusivo — um único dia é "dia"', () => {
    expect(granularidadeDoPeriodo({ de: '2026-07-15', ate: '2026-07-15' })).toBe('dia')
  })
})

describe('contarMeses', () => {
  it('conta 1 para o mesmo mês', () => {
    expect(contarMeses({ de: '2026-07-01', ate: '2026-07-31' })).toBe(1)
  })

  it('conta o ano inteiro (jan→dez) como 12', () => {
    expect(contarMeses({ de: '2026-01-01', ate: '2026-12-31' })).toBe(12)
  })

  it('atravessa a virada do ano (dez/2025 → jan/2026 = 2)', () => {
    expect(contarMeses({ de: '2025-12-15', ate: '2026-01-03' })).toBe(2)
  })
})

describe('mesesDoIntervalo', () => {
  it('lista os meses yyyy-MM, inclusive atravessando o ano', () => {
    expect(mesesDoIntervalo({ de: '2025-11-20', ate: '2026-02-05' })).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02',
    ])
  })

  it('devolve um único mês quando de/ate estão no mesmo mês', () => {
    expect(mesesDoIntervalo({ de: '2026-07-02', ate: '2026-07-28' })).toEqual(['2026-07'])
  })
})

describe('rotuloMes', () => {
  it('mostra só a abreviação quando o eixo é de um ano só', () => {
    expect(rotuloMes('2026-01', false)).toBe('jan')
    expect(rotuloMes('2026-12', false)).toBe('dez')
  })

  it('anexa o ano com 2 dígitos quando o eixo cruza anos', () => {
    expect(rotuloMes('2025-12', true)).toBe('dez/25')
    expect(rotuloMes('2026-01', true)).toBe('jan/26')
  })
})

describe('chaveSemana', () => {
  it('normaliza qualquer dia para a segunda-feira (ISO) da sua semana', () => {
    // 2026-07-15 é quarta; a segunda da semana é 2026-07-13.
    expect(chaveSemana('2026-07-15')).toBe('2026-07-13')
    // Domingo 2026-07-19 ainda pertence à semana que começa em 13/07.
    expect(chaveSemana('2026-07-19')).toBe('2026-07-13')
    // A própria segunda-feira é ponto fixo.
    expect(chaveSemana('2026-07-13')).toBe('2026-07-13')
  })
})

describe('baldesCurtos', () => {
  it('gera um balde por dia (eixo inclusivo)', () => {
    expect(baldesCurtos({ de: '2026-07-13', ate: '2026-07-15' }, 'dia')).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15',
    ])
  })

  it('gera um balde por semana (segundas-feiras), cobrindo as pontas', () => {
    // de = quarta 01/07, ate = segunda 20/07 → semanas 29/06, 06/07, 13/07, 20/07.
    expect(baldesCurtos({ de: '2026-07-01', ate: '2026-07-20' }, 'semana')).toEqual([
      '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20',
    ])
  })
})

describe('montarSerieMensal', () => {
  it('preenche todos os meses do eixo (com zeros) quando são poucos', () => {
    const linhas: LinhaSerieMensal[] = [
      { mes: '2026-02-01', tipo: 'saida', total: 5 },
      { mes: '2026-02-01', tipo: 'devolucao', total: 2 },
    ]
    const serie = montarSerieMensal(linhas, { de: '2026-01-01', ate: '2026-03-31' })
    expect(serie.granularidade).toBe('mes')
    expect(serie.pontos).toEqual([
      { chave: '2026-01', rotulo: 'jan', saidas: 0, devolucoes: 0 },
      { chave: '2026-02', rotulo: 'fev', saidas: 5, devolucoes: 2 },
      { chave: '2026-03', rotulo: 'mar', saidas: 0, devolucoes: 0 },
    ])
  })

  it('usa rótulo com ano quando o eixo cruza anos', () => {
    const serie = montarSerieMensal([], { de: '2025-12-01', ate: '2026-01-31' })
    expect(serie.pontos.map((p) => p.rotulo)).toEqual(['dez/25', 'jan/26'])
  })

  it('acima do teto de meses mostra só os meses com registro, ordenados', () => {
    // ~319 meses (> MESES_MAX_EIXO_PREENCHIDO) → não preenche o eixo.
    expect(MESES_MAX_EIXO_PREENCHIDO).toBe(24)
    const linhas: LinhaSerieMensal[] = [
      { mes: '2026-07-01', tipo: 'saida', total: 3 },
      { mes: '2026-02-01', tipo: 'saida', total: 1 },
    ]
    const serie = montarSerieMensal(linhas, { de: '2000-01-01', ate: '2026-07-15' })
    expect(serie.pontos.map((p) => p.chave)).toEqual(['2026-02', '2026-07'])
  })

  // Limite EXATO do eixo preenchido (24 meses): fixa os dois lados da fronteira
  // <= MESES_MAX_EIXO_PREENCHIDO, senão trocar `<=` por `<` passaria despercebido.
  it('no limite de 24 meses ainda PREENCHE o eixo inteiro (com zeros)', () => {
    const periodo = { de: '2026-01-01', ate: '2027-12-31' }
    expect(contarMeses(periodo)).toBe(MESES_MAX_EIXO_PREENCHIDO) // 24
    const linhas: LinhaSerieMensal[] = [{ mes: '2026-03-01', tipo: 'saida', total: 4 }]
    const serie = montarSerieMensal(linhas, periodo)
    expect(serie.pontos).toHaveLength(24)
    expect(serie.pontos[0]).toEqual({ chave: '2026-01', rotulo: 'jan/26', saidas: 0, devolucoes: 0 })
    expect(serie.pontos[2]).toEqual({ chave: '2026-03', rotulo: 'mar/26', saidas: 4, devolucoes: 0 })
    expect(serie.pontos.at(-1)!.chave).toBe('2027-12')
  })

  it('logo acima do limite (25 meses) mostra SÓ os meses com registro', () => {
    const periodo = { de: '2026-01-01', ate: '2028-01-31' }
    expect(contarMeses(periodo)).toBe(MESES_MAX_EIXO_PREENCHIDO + 1) // 25
    const linhas: LinhaSerieMensal[] = [
      { mes: '2027-05-01', tipo: 'saida', total: 2 },
      { mes: '2026-09-01', tipo: 'devolucao', total: 1 },
    ]
    const serie = montarSerieMensal(linhas, periodo)
    expect(serie.pontos.map((p) => p.chave)).toEqual(['2026-09', '2027-05'])
  })

  it('coage total textual (numeric do Postgres pode vir string)', () => {
    const linhas = [
      { mes: '2026-05-01', tipo: 'saida', total: '7' },
    ] as unknown as LinhaSerieMensal[]
    const serie = montarSerieMensal(linhas, { de: '2026-05-01', ate: '2026-05-31' })
    expect(serie.pontos).toEqual([{ chave: '2026-05', rotulo: 'mai', saidas: 7, devolucoes: 0 }])
  })
})

describe('montarSerieCurta', () => {
  it('conta por DIA e preenche dias sem movimento com zero', () => {
    const linhas: LinhaSerieCurta[] = [
      { data: '2026-07-14', tipo: 'saida' },
      { data: '2026-07-14', tipo: 'saida' },
      { data: '2026-07-14', tipo: 'devolucao' },
      { data: '2026-07-15', tipo: 'saida' },
    ]
    const serie = montarSerieCurta(linhas, { de: '2026-07-13', ate: '2026-07-15' }, 'dia')
    expect(serie.granularidade).toBe('dia')
    expect(serie.pontos).toEqual([
      { chave: '2026-07-13', rotulo: '13/07', saidas: 0, devolucoes: 0 },
      { chave: '2026-07-14', rotulo: '14/07', saidas: 2, devolucoes: 1 },
      { chave: '2026-07-15', rotulo: '15/07', saidas: 1, devolucoes: 0 },
    ])
  })

  it('agrupa por SEMANA (segunda-feira) e rotula com a data da semana', () => {
    const linhas: LinhaSerieCurta[] = [
      { data: '2026-07-08', tipo: 'saida' }, // semana de 06/07
      { data: '2026-07-15', tipo: 'devolucao' }, // semana de 13/07
    ]
    const serie = montarSerieCurta(linhas, { de: '2026-07-06', ate: '2026-07-19' }, 'semana')
    expect(serie.granularidade).toBe('semana')
    expect(serie.pontos).toEqual([
      { chave: '2026-07-06', rotulo: '06/07', saidas: 1, devolucoes: 0 },
      { chave: '2026-07-13', rotulo: '13/07', saidas: 0, devolucoes: 1 },
    ])
  })

  it('ignora tipos fora de saída/devolução no cálculo', () => {
    const linhas = [
      { data: '2026-07-14', tipo: 'transferencia' },
      { data: '2026-07-14', tipo: 'saida' },
    ] as unknown as LinhaSerieCurta[]
    const serie = montarSerieCurta(linhas, { de: '2026-07-14', ate: '2026-07-14' }, 'dia')
    expect(serie.pontos).toEqual([{ chave: '2026-07-14', rotulo: '14/07', saidas: 1, devolucoes: 0 }])
  })
})
