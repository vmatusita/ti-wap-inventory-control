import { format, parseISO, subDays } from 'date-fns'

// Chips de período da lista de movimentações (F28/MOV-05): Hoje · Ontem · 7
// dias, aplicados direto em `de`/`ate` na URL. `hoje` é PARÂMETRO — a função é
// pura e testável sem `Date.now()` dentro, mesma doutrina de `resolverPeriodo`
// (lib/relatorios/periodo.ts).

export type ChavePeriodo = 'hoje' | 'ontem' | '7dias'

export type Periodo = { de: string; ate: string }

const CHAVES: readonly ChavePeriodo[] = ['hoje', 'ontem', '7dias']

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

// Período correspondente ao chip. `7dias` = os ÚLTIMOS 7 dias INCLUINDO hoje
// (subDays(hoje, 6)..hoje) — mesma fórmula de `intervaloDoPreset('30dias')`
// (lib/relatorios/periodo.ts:52-53), com 6 no lugar de 29.
export function periodoDoChip(chave: ChavePeriodo, hoje: string): Periodo {
  const base = parseISO(hoje)
  switch (chave) {
    case 'hoje':
      return { de: hoje, ate: hoje }
    case 'ontem': {
      const ontem = fmt(subDays(base, 1))
      return { de: ontem, ate: ontem }
    }
    case '7dias':
      return { de: fmt(subDays(base, 6)), ate: hoje }
  }
}

// A chave do chip ATIVO, para o `aria-pressed` — comparando o `de`/`ate`
// correntes da URL contra os três presets. `null` quando o par não corresponde
// a nenhum chip: um dos dois vazio, ou datas escolhidas à mão que não batem com
// nenhum preset.
export function chipAtivo(
  de: string,
  ate: string,
  hoje: string,
): ChavePeriodo | null {
  if (!de || !ate) return null
  for (const chave of CHAVES) {
    const p = periodoDoChip(chave, hoje)
    if (p.de === de && p.ate === ate) return chave
  }
  return null
}
