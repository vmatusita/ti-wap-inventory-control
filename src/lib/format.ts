import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Formatacao de datas/numeros (CLAUDE.md: datas dd/MM/yyyy, locale ptBR).
//
// Fuso do negocio: America/Sao_Paulo (UTC-3, sem horario de verao desde 2019). O
// app roda na Vercel em UTC, entao QUALQUER timestamp (timestamptz) precisa ser
// convertido para SP na exibicao — senao a hora fica 3h adiantada e datas perto
// da meia-noite "viram o dia". Sem dependencia nova: usamos Intl nativo.
const FUSO = 'America/Sao_Paulo'
const DATA_PURA_RE = /^\d{4}-\d{2}-\d{2}$/

// Extrai as partes de um instante ja no fuso de São Paulo.
function partesSP(
  d: Date,
  opts: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    ...opts,
  }).formatToParts(d)
  const out: Record<string, string> = {}
  for (const p of partes) out[p.type] = p.value
  return out
}

// Data (dd/MM/yyyy). Aceita tanto data pura ('yyyy-MM-dd', coluna `date`) quanto
// timestamptz (`created_at`, `updated_at`).
//  - Data pura: parseISO = meia-noite local, sem risco de fuso.
//  - Timestamptz: renderiza a DATA no fuso de SP — evita cair no dia anterior/
//    seguinte quando o processo roda em UTC (Vercel).
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  if (DATA_PURA_RE.test(iso)) {
    try {
      return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
    } catch {
      return iso
    }
  }
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const p = partesSP(d, { day: '2-digit', month: '2-digit', year: 'numeric' })
    return `${p.day}/${p.month}/${p.year}`
  } catch {
    return iso
  }
}

// Timestamp (timestamptz, `created_at`/`gerado_em`/`ultimo_uso`). Exibe data +
// hora SEMPRE no fuso de São Paulo (UTC-3), independente do fuso do runtime.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const p = partesSP(d, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`
  } catch {
    return iso
  }
}

// Valor textual ou travessão quando vazio/nulo.
export function ouTraco(v: string | null | undefined): string {
  return v && v.trim() ? v : '—'
}

// Data de hoje em 'yyyy-MM-dd' no fuso de São Paulo (BRT) — default do campo
// `data`, teto do "não pode ser futura" e data do estorno. Fixa o fuso de
// propósito: `new Date()` local viraria a data 3h cedo demais quando o processo
// roda em UTC (Vercel). `en-CA` formata como yyyy-MM-dd.
export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
  }).format(new Date())
}
