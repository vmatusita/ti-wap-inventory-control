import {
  parseISO,
  format,
  differenceInCalendarDays,
  startOfWeek,
  addDays,
  addWeeks,
} from 'date-fns'
import type { Periodo } from '@/lib/relatorios/periodo'
import type {
  GranularidadeSerie,
  PontoSerie,
  SerieMovimentacoes,
} from '@/lib/relatorios/tipos'

// Matemática PURA da série de movimentações adaptativa ao período (OS-F3 3.1,
// extraída de queries/relatorios.ts). Sem acesso a dados: recebe as linhas cruas
// já lidas do banco e devolve a série pronta — baldes preenchidos + rótulos ptBR.
//
// O relatório da WAP é semanal; um gráfico fixo "por mês" mostrava uma barra só e
// ficava obsoleto no snapshot gerado. A granularidade agora acompanha a duração:
// janela curta (semana) → por DIA, média → por SEMANA, longa (ano/tudo) → por
// MÊS. Rótulos e eixo já vêm prontos, então o snapshot congelado é estável no
// tempo. Módulo 100% testável (serie.test.ts).

// Limiares da granularidade — intervalo INCLUSIVO [de, ate], contado em dias:
// até 16 dias (uma semana/quinzena) → dia; até 120 (~um trimestre) → semana;
// acima disso → mês.
export const DIAS_MAX_GRANULARIDADE_DIA = 16
export const DIAS_MAX_GRANULARIDADE_SEMANA = 120
// Mensal: preenche o eixo com TODOS os meses do intervalo quando são poucos (até
// ~2 anos); no "tudo" (dezenas de meses) mostra só os meses com registro.
export const MESES_MAX_EIXO_PREENCHIDO = 24

const MESES_ABREV = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

export function granularidadeDoPeriodo(periodo: Periodo): GranularidadeSerie {
  const dias =
    differenceInCalendarDays(parseISO(periodo.ate), parseISO(periodo.de)) + 1
  if (dias <= DIAS_MAX_GRANULARIDADE_DIA) return 'dia'
  if (dias <= DIAS_MAX_GRANULARIDADE_SEMANA) return 'semana'
  return 'mes'
}

export function contarMeses(periodo: Periodo): number {
  const de = parseISO(periodo.de)
  const ate = parseISO(periodo.ate)
  return (
    (ate.getFullYear() * 12 + ate.getMonth()) -
    (de.getFullYear() * 12 + de.getMonth()) +
    1
  )
}

export function mesesDoIntervalo(periodo: Periodo): string[] {
  const de = parseISO(periodo.de)
  const inicio = de.getFullYear() * 12 + de.getMonth()
  const qtd = contarMeses(periodo)
  const out: string[] = []
  for (let i = 0; i < qtd; i++) {
    const idx = inicio + i
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

export function rotuloMes(mes: string, multiAno: boolean): string {
  const [ano, m] = mes.split('-')
  const nome = MESES_ABREV[Number(m) - 1] ?? mes
  return multiAno ? `${nome}/${ano.slice(2)}` : nome
}

// Balde da semana (segunda-feira ISO) que contém `dataISO`, em 'yyyy-MM-dd'.
export function chaveSemana(dataISO: string): string {
  return format(startOfWeek(parseISO(dataISO), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

// Eixo completo de dias/semanas do período (inclui baldes sem movimento — o
// relatório da semana mostra segunda a sexta mesmo sem registro no dia).
export function baldesCurtos(periodo: Periodo, gran: 'dia' | 'semana'): string[] {
  const out: string[] = []
  const fim = gran === 'dia' ? parseISO(periodo.ate) : startOfWeek(parseISO(periodo.ate), { weekStartsOn: 1 })
  let d = gran === 'dia' ? parseISO(periodo.de) : startOfWeek(parseISO(periodo.de), { weekStartsOn: 1 })
  const passo = gran === 'dia' ? (x: Date) => addDays(x, 1) : (x: Date) => addWeeks(x, 1)
  while (d <= fim) {
    out.push(format(d, 'yyyy-MM-dd'))
    d = passo(d)
  }
  return out
}

// ---- Balde-builders: linhas cruas (já lidas do banco) → série pronta ----

type Contagem = { saidas: number; devolucoes: number }
const zero = (): Contagem => ({ saidas: 0, devolucoes: 0 })

// Mensal: uma linha por (mês, tipo) já agregada no banco (rel_mov_por_mes_filiais). O
// eixo é preenchido com todos os meses (até MESES_MAX_EIXO_PREENCHIDO); acima
// disso mostra só os meses com registro, ordenados.
export type LinhaSerieMensal = { mes: string; tipo: string; total: number }

export function montarSerieMensal(
  linhas: LinhaSerieMensal[],
  periodo: Periodo,
): SerieMovimentacoes {
  const map = new Map<string, Contagem>()
  for (const r of linhas) {
    const mes = String(r.mes).slice(0, 7)
    const cur = map.get(mes) ?? zero()
    if (r.tipo === 'saida') cur.saidas = Number(r.total)
    else if (r.tipo === 'devolucao') cur.devolucoes = Number(r.total)
    map.set(mes, cur)
  }

  const baldes =
    contarMeses(periodo) <= MESES_MAX_EIXO_PREENCHIDO
      ? mesesDoIntervalo(periodo)
      : [...map.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const multiAno = new Set(baldes.map((m) => m.slice(0, 4))).size > 1

  const pontos: PontoSerie[] = baldes.map((mes) => {
    const v = map.get(mes) ?? zero()
    return {
      chave: mes,
      rotulo: rotuloMes(mes, multiAno),
      saidas: v.saidas,
      devolucoes: v.devolucoes,
    }
  })
  return { granularidade: 'mes', pontos }
}

// Dia/semana: uma linha por movimentação crua (data, tipo). Conta por balde e
// preenche o eixo inteiro (todos os dias/semanas), inclusive zeros.
export type LinhaSerieCurta = { data: string; tipo: string }

export function montarSerieCurta(
  linhas: LinhaSerieCurta[],
  periodo: Periodo,
  gran: 'dia' | 'semana',
): SerieMovimentacoes {
  const contagem = new Map<string, Contagem>()
  for (const r of linhas) {
    const chave = gran === 'dia' ? r.data : chaveSemana(r.data)
    const cur = contagem.get(chave) ?? zero()
    if (r.tipo === 'saida') cur.saidas += 1
    else if (r.tipo === 'devolucao') cur.devolucoes += 1
    contagem.set(chave, cur)
  }

  const pontos: PontoSerie[] = baldesCurtos(periodo, gran).map((chave) => {
    const v = contagem.get(chave) ?? zero()
    return {
      chave,
      rotulo: format(parseISO(chave), 'dd/MM'),
      saidas: v.saidas,
      devolucoes: v.devolucoes,
    }
  })
  return { granularidade: gran, pontos }
}
