import {
  parseISO,
  format,
  subDays,
  subWeeks,
  startOfWeek,
  endOfWeek,
  startOfYear,
  differenceInCalendarDays,
} from 'date-fns'
import { hojeISO } from '@/lib/format'
import { dataISO } from '@/lib/url-params'

// Período do relatório (spec §7 / OS-F3 3.2.1). Datas puras 'yyyy-MM-dd',
// intervalo INCLUSIVO [de, ate]. Os presets são resolvidos a partir de
// `hojeISO()` (fuso São Paulo), então não há drift de fuso no servidor (UTC).

export type Periodo = { de: string; ate: string }
export type PresetPeriodo =
  | 'semana'
  | 'semana-passada'
  | '30dias'
  | 'ano'
  | 'tudo'
  | 'custom'

// Default do relatório ao vivo (filial e consolidado): semana atual dom–sáb
// (decisão do Johnny, 16/07/2026 — B2/F6B). Ver `intervaloDoPreset('semana')`.
export const PRESET_PADRAO: PresetPeriodo = 'semana'
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

// F29/REL-03 — o par de `semanaUtilCorrente`: segunda a sexta da semana ANTERIOR.
// É o atalho "Usar semana passada" do dialog "Gerar relatório", e mantém a janela
// SEG–SEX que aquela superfície sempre usou. Ver a nota de dualidade abaixo.
export function semanaUtilAnterior(hoje: string = hojeISO()): Periodo {
  return semanaUtilCorrente(fmt(subWeeks(parseISO(hoje), 1)))
}

export const PRESETS: { valor: Exclude<PresetPeriodo, 'custom'>; rotulo: string }[] = [
  { valor: 'semana', rotulo: 'Esta semana' },
  // F29/REL-03 — o recorte mais pedido do relatório semanal: a semana que FECHOU.
  // Antes exigia "Personalizado" com duas datas na manhã de segunda.
  { valor: 'semana-passada', rotulo: 'Semana passada' },
  { valor: '30dias', rotulo: 'Últimos 30 dias' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'tudo', rotulo: 'Tudo' },
]

function intervaloDoPreset(preset: Exclude<PresetPeriodo, 'custom'>, hoje: string): Periodo {
  const base = parseISO(hoje)
  switch (preset) {
    // "Esta semana": semana corrente domingo→sábado (B2/F6B). `ate = hoje` (e não
    // sábado) porque `hoje` está SEMPRE dentro da semana [domingo..sábado], então
    // `hoje === min(sábado, hoje)`; usar `hoje` mantém paridade com os demais
    // presets e deixa o rótulo honesto (sem dias futuros vazios no intervalo).
    case 'semana':
      return { de: fmt(startOfWeek(base, { weekStartsOn: 0 })), ate: hoje }
    // "Semana passada": a semana INTEIRA anterior, domingo→sábado — a variante −1
    // da janela do preset acima, e por isso `ate` é o SÁBADO (e não `hoje`): a
    // semana já fechou, então o intervalo completo está todo no passado e não há
    // dia futuro vazio para esconder.
    //
    // ⚠ DUALIDADE DELIBERADA (decisão aberta T11, que esta fase NÃO resolve): o
    // relatório AO VIVO conta a semana de domingo a sábado, enquanto o dialog
    // "Gerar relatório" usa segunda a sexta (`semanaUtilCorrente`/`semanaUtilAnterior`,
    // o recorte dos e-mails reais). O preset novo HERDA essa dualidade em vez de
    // arbitrar: cada superfície segue a janela que já usava. Ata em docs/DECISOES.md.
    case 'semana-passada': {
      const anterior = subWeeks(base, 1)
      return {
        de: fmt(startOfWeek(anterior, { weekStartsOn: 0 })),
        ate: fmt(endOfWeek(anterior, { weekStartsOn: 0 })),
      }
    }
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
//
// A validação é `dataISO` (@/lib/url-params), não o regex de FORMATO: uma data
// que só case `^\d{4}-\d{2}-\d{2}$` pode não existir (`2026-02-30`) ou estar fora
// da faixa que o Postgres aceita (`0000-01-01`), e o período segue direto para a
// RPC `rel_estoque_asof_filiais` e para os `.gte('data', …)` — o banco devolve 22008 e a
// página inteira do relatório cai no error boundary, para o operador E para o
// visualizador por senha. É a mesma classe do achado F12-W4-04, que já havia sido
// encerrada em /ativos, /itens, /movimentacoes e nos exports; faltava aqui.
export function resolverPeriodo(
  sp: { preset?: string; de?: string; ate?: string },
  hoje: string = hojeISO(),
): PeriodoResolvido {
  const de = dataISO(sp.de)
  const ate = dataISO(sp.ate)
  if (sp.preset === 'custom' || (sp.de && sp.ate)) {
    if (de && ate && de <= ate) {
      return { de, ate, preset: 'custom', rotulo: 'Período personalizado' }
    }
  }

  const presetValido = PRESETS.find((p) => p.valor === sp.preset)?.valor
  const preset = presetValido ?? PRESET_PADRAO
  const intervalo = intervaloDoPreset(preset as Exclude<PresetPeriodo, 'custom'>, hoje)
  const rotulo = PRESETS.find((p) => p.valor === preset)?.rotulo ?? 'Esta semana'
  return { ...intervalo, preset, rotulo }
}

// Período anterior de MESMA duração, terminando na véspera de `de`. É a janela de
// comparação do Δ dos KPIs (`kpisAnterior`).
//
// F29/REL-07 — a função MORAVA em `queries/relatorios/snapshot.ts`, que arrasta o
// client do Supabase. O Δ passou a mostrar a janela em texto ("Anterior: N
// (dd/MM–dd/MM)"), e esse texto é montado por um componente de apresentação: se
// ele recalculasse a janela por conta própria, o rótulo poderia divergir do número
// sem ninguém perceber. Trazer a função para cá (módulo puro) mantém UMA definição
// para os dois usos — `snapshot.ts` agora importa daqui.
export function periodoAnterior(periodo: Periodo): Periodo {
  const dias = differenceInCalendarDays(parseISO(periodo.ate), parseISO(periodo.de)) + 1
  return {
    de: fmt(subDays(parseISO(periodo.de), dias)),
    ate: fmt(subDays(parseISO(periodo.de), 1)),
  }
}

// F29/REL-04b — período com que o dialog "Gerar relatório" ABRE. Antes era sempre a
// semana útil corrente, mesmo com o operador analisando outro recorte na tela: uma
// armadilha silenciosa (o snapshot congelava um período diferente do que estava
// sendo lido). Agora abre com o período ATIVO da página, com duas defesas:
//   · `ate` nunca passa do teto (a action recusaria "data final no futuro", e o
//     botão ficaria desabilitado sem explicação);
//   · se o recorte encolher a ponto de ficar inválido (`de > ate` — acontece com um
//     período custom inteiramente no futuro), volta para a semana útil, que é o
//     comportamento de antes desta fase.
export function periodoInicialDoDialog(
  periodo: Periodo,
  semana: Periodo,
  teto: string,
): Periodo {
  const ate = periodo.ate > teto ? teto : periodo.ate
  if (periodo.de > ate) return semana
  return { de: periodo.de, ate }
}
