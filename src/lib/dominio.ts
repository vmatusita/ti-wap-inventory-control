// Metadados de dominio para a UI (rotulos pt-BR e cores de badge). NAO e regra
// de negocio — a fonte da verdade dos estados/transicoes e o Postgres (0004) e
// os validadores Zod (src/lib/validators/movimentacao.ts). Aqui so mora a
// apresentacao. Identificadores de dominio em pt sem acento (CLAUDE.md).
import type { Enums } from '@/lib/types/database'

export type StatusAtivo = Enums<'status_ativo'>
export type TipoMovimentacao = Enums<'tipo_movimentacao'>
export type CategoriaAtivo = Enums<'categoria_ativo'>
export type TermoStatus = Enums<'termo_status'>

// ---------- STATUS ----------
// Cores por grupo (spec §6.3 / OS-F2 3.1.1): em_uso azul-claro, em_estoque
// verde-claro, manutencao ambar, descartado cinza, defasado neutro. Os demais
// (reservado, emprestado, em_triagem) recebem cores distintas coerentes.
export const STATUS_META: Record<
  StatusAtivo,
  { rotulo: string; badge: string }
> = {
  em_estoque: {
    rotulo: 'Em estoque',
    badge:
      'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-transparent',
  },
  reservado: {
    rotulo: 'Reservado',
    badge:
      'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-transparent',
  },
  em_uso: {
    rotulo: 'Em uso',
    badge:
      'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-transparent',
  },
  emprestado: {
    rotulo: 'Emprestado',
    badge:
      'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 border-transparent',
  },
  em_triagem: {
    rotulo: 'Em triagem',
    badge:
      'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-transparent',
  },
  em_manutencao: {
    rotulo: 'Em manutenção',
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-transparent',
  },
  defasado: {
    rotulo: 'Defasado',
    badge: 'bg-muted text-muted-foreground border-transparent',
  },
  descartado: {
    rotulo: 'Descartado',
    badge:
      'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-transparent',
  },
}

export function rotuloStatus(s: StatusAtivo): string {
  return STATUS_META[s]?.rotulo ?? s
}

// ---------- TIPO DE MOVIMENTACAO ----------
export const TIPO_META: Record<TipoMovimentacao, { rotulo: string }> = {
  compra: { rotulo: 'Compra' },
  saida: { rotulo: 'Saída' },
  emprestimo: { rotulo: 'Empréstimo' },
  reserva: { rotulo: 'Reserva' },
  devolucao: { rotulo: 'Devolução' },
  triagem_ok: { rotulo: 'Triagem OK' },
  envio_manutencao: { rotulo: 'Envio p/ manutenção' },
  retorno_manutencao: { rotulo: 'Retorno de manutenção' },
  marcar_defasado: { rotulo: 'Marcar defasado' },
  descarte: { rotulo: 'Descarte' },
  transferencia: { rotulo: 'Transferência' },
  ajuste: { rotulo: 'Ajuste' },
  estorno: { rotulo: 'Estorno' },
}

export function rotuloTipo(t: TipoMovimentacao): string {
  return TIPO_META[t]?.rotulo ?? t
}

// Pílula colorida da coluna Tipo nas tabelas de relatório (OS-F3 3.3.5):
// saída amarela, devolução azul, compra verde; os demais tipos, neutro.
const TIPO_PILL: Partial<Record<TipoMovimentacao, string>> = {
  saida: 'bg-amber-100 text-amber-800',
  devolucao: 'bg-blue-100 text-blue-700',
  compra: 'bg-green-100 text-green-700',
}

export function pillTipo(t: TipoMovimentacao): string {
  return TIPO_PILL[t] ?? 'bg-muted text-muted-foreground'
}

// ---------- CATEGORIA ----------
export const CATEGORIA_META: Record<CategoriaAtivo, { rotulo: string }> = {
  notebook: { rotulo: 'Notebook' },
  desktop: { rotulo: 'Desktop' },
  monitor: { rotulo: 'Monitor' },
  celular: { rotulo: 'Celular' },
  tablet: { rotulo: 'Tablet' },
  outro: { rotulo: 'Outro' },
}

export function rotuloCategoria(c: CategoriaAtivo): string {
  return CATEGORIA_META[c]?.rotulo ?? c
}

// Ordem canonica para selects/filtros (segue os enums do banco).
export const STATUS_ORDEM: StatusAtivo[] = [
  'em_estoque',
  'reservado',
  'em_uso',
  'emprestado',
  'em_triagem',
  'em_manutencao',
  'defasado',
  'descartado',
]

export const CATEGORIA_ORDEM: CategoriaAtivo[] = [
  'notebook',
  'celular',
  'monitor',
  'desktop',
  'tablet',
  'outro',
]

// ---------- TERMO ----------
export const TERMO_META: Record<TermoStatus, { rotulo: string }> = {
  sim: { rotulo: 'Assinado' },
  enviado: { rotulo: 'Enviado (sem assinatura)' },
  nao: { rotulo: 'Não gerado' },
}

export function rotuloTermo(t: TermoStatus | null | undefined): string {
  if (!t) return 'Não informado'
  return TERMO_META[t]?.rotulo ?? t
}

// ---------- ITENS DA DEVOLUCAO (checklist — OS-F2 3.5.2) ----------
// Acessorios conferidos na devolucao. Um item marcado = FALTANTE (vira pendencia).
export const ACESSORIOS_DEVOLUCAO = [
  'carregador',
  'mochila',
  'mouse',
  'teclado',
  'mousepad',
  'fone',
  'cabo',
] as const

export const ACESSORIO_ROTULO: Record<string, string> = {
  carregador: 'Carregador',
  mochila: 'Mochila',
  mouse: 'Mouse',
  teclado: 'Teclado',
  mousepad: 'Mousepad',
  fone: 'Fone',
  cabo: 'Cabo',
}

export function rotuloAcessorio(codigo: string): string {
  return ACESSORIO_ROTULO[codigo] ?? codigo
}
