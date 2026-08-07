import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Formatacao de datas/numeros (CLAUDE.md: datas dd/MM/yyyy, locale ptBR).
//
// Fuso do negocio: America/Sao_Paulo (UTC-3, sem horario de verao desde 2019). O
// app roda na Vercel em UTC, entao QUALQUER timestamp (timestamptz) precisa ser
// convertido para SP na exibicao — senao a hora fica 3h adiantada e datas perto
// da meia-noite "viram o dia". Sem dependencia nova: usamos Intl nativo.
const FUSO = 'America/Sao_Paulo'
// Offset fixo de São Paulo (UTC-3, sem horário de verão desde 2019). Fonte única
// do literal que antes aparecia solto em queries/relatorios.ts — se o Brasil um
// dia reintroduzir horário de verão, é AQUI que muda.
const OFFSET_SP = '-03:00'
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

// Só a HORA (HH:mm) de um timestamptz, no fuso de São Paulo. F28/MOV-06: a lista
// de movimentações mostra `data` (a data de NEGÓCIO, digitada, que pode ser
// retroativa) na coluna Data e a hora do REGISTRO ao lado — as duas divergem de
// propósito quando se lança ontem hoje, e é a hora do registro que separa um lote
// do outro. Fatiar a string ISO devolveria a hora em UTC (3h adiantada).
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    const p = partesSP(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    return `${p.hour}:${p.minute}`
  } catch {
    return '—'
  }
}

// "há 2 h" / "agora mesmo" — tempo decorrido em pt-BR, granularidade grossa de
// propósito (F28/MOV-11: o banner do rascunho só precisa dizer se o lote é de
// agora ou de anteontem). `agora` é PARÂMETRO para a função ser pura e testável;
// quem chama passa `Date.now()`.
//
// Instante no futuro (relógio do cliente atrasado em relação ao servidor que
// gravou) cai em "agora mesmo" — nunca "há -3 min".
export function formatTempoRelativo(
  iso: string | null | undefined,
  agora: number,
): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const seg = Math.floor((agora - t) / 1000)
  if (seg < 60) return 'agora mesmo'
  const min = Math.floor(seg / 60)
  if (min < 60) return `há ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
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

// Data de ontem em 'yyyy-MM-dd' no fuso de São Paulo — atalho "Ontem" dos campos
// de data do fluxo de movimentação (F9/M10). Mesma mecânica de `hojeISO`: o
// instante é 24h atrás e a formatação acontece NO FUSO DE SP. Usar
// `toISOString()` cru devolveria a data em UTC e viraria o dia entre 21:00 e
// 23:59 BRT (quando em UTC já é o dia seguinte).
export function ontemISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
  }).format(new Date(Date.now() - 86_400_000))
}

// Data (yyyy-MM-dd) de um instante (timestamptz) já no fuso de São Paulo. Usado
// para comparar `created_at` (UTC) com colunas `date` de negócio (que já estão
// em SP) sem o erro de fuso de `iso.slice(0,10)` — que devolveria a data UTC.
export function dataEmSP(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(iso))
}

// Instante do FIM do dia `data` ('yyyy-MM-dd') no fuso de São Paulo, como ISO com
// offset — teto para comparar contra timestamptz (ex.: `.lte('created_at', …)`).
// Sem isto, um teto em UTC (`…T23:59:59Z`) perderia os registros das últimas 3h
// do dia em SP (21:00–23:59 BRT cai no dia seguinte em UTC).
export function fimDoDiaSP(data: string): string {
  return `${data}T23:59:59.999${OFFSET_SP}`
}
