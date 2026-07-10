import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Formatacao de datas/numeros (CLAUDE.md: datas dd/MM/yyyy, locale ptBR).

// Data pura ('yyyy-MM-dd', coluna `date`). parseISO sem hora = meia-noite local,
// entao nao ha risco de "voltar um dia" por fuso.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return iso
  }
}

// Timestamp (timestamptz, `created_at`). Exibe data + hora no fuso local.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
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
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())
}
