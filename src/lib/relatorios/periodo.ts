import {
  parseISO,
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfYear,
} from 'date-fns'
import { hojeISO } from '@/lib/format'
import { DATA_RE } from '@/lib/validators/data'

// Período do relatório (spec §7 / OS-F3 3.2.1). Datas puras 'yyyy-MM-dd',
// intervalo INCLUSIVO [de, ate]. Os presets são resolvidos a partir de
// `hojeISO()` (fuso São Paulo), então não há drift de fuso no servidor (UTC).

export type Periodo = { de: string; ate: string }
export type PresetPeriodo = 'semana' | '30dias' | 'ano' | 'tudo' | 'custom'

export const PRESET_PADRAO: PresetPeriodo = 'ano'
const DATA_MINIMA = '2000-01-01' // "Tudo": teto inferior seguro

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

// Segunda a sexta da semana corrente — recorte dos e-mails reais ("22/06 até
// 26/06"). Default do dialog "Gerar relatório" (OS-F3 3.8.3).
export function semanaUtilCorrente(hoje: string = hojeISO()): Periodo {
  const base = parseISO(hoje)
  const segunda = startOfWeek(base, { weekStartsOn: 1 })
  return { de: fmt(segunda), ate: fmt(subDays(endOfWeek(base, { weekStartsOn: 1 }), 2)) }
}

export const PRESETS: { valor: Exclude<PresetPeriodo, 'custom'>; rotulo: string }[] = [
  { valor: 'semana', rotulo: 'Esta semana' },
  { valor: '30dias', rotulo: 'Últimos 30 dias' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'tudo', rotulo: 'Tudo' },
]

function intervaloDoPreset(preset: Exclude<PresetPeriodo, 'custom'>, hoje: string): Periodo {
  const base = parseISO(hoje)
  switch (preset) {
    case 'semana':
      return { de: fmt(startOfWeek(base, { weekStartsOn: 1 })), ate: hoje }
    case '30dias':
      return { de: fmt(subDays(base, 29)), ate: hoje }
    case 'ano':
      return { de: fmt(startOfYear(base)), ate: hoje }
    case 'tudo':
      return { de: DATA_MINIMA, ate: hoje }
  }
}

export type PeriodoResolvido = {
  de: string
  ate: string
  preset: PresetPeriodo
  rotulo: string
}

// Resolve o período a partir dos searchParams (?preset= / ?de=&ate=). Custom só
// vale se de/ate forem datas válidas e de <= ate; senão cai no preset padrão.
export function resolverPeriodo(
  sp: { preset?: string; de?: string; ate?: string },
  hoje: string = hojeISO(),
): PeriodoResolvido {
  const de = sp.de
  const ate = sp.ate
  if (sp.preset === 'custom' || (de && ate)) {
    if (de && ate && DATA_RE.test(de) && DATA_RE.test(ate) && de <= ate) {
      return { de, ate, preset: 'custom', rotulo: 'Período personalizado' }
    }
  }

  const presetValido = PRESETS.find((p) => p.valor === sp.preset)?.valor
  const preset = presetValido ?? PRESET_PADRAO
  const intervalo = intervaloDoPreset(preset as Exclude<PresetPeriodo, 'custom'>, hoje)
  const rotulo = PRESETS.find((p) => p.valor === preset)?.rotulo ?? 'Este ano'
  return { ...intervalo, preset, rotulo }
}
