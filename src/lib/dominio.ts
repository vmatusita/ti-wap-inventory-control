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

// Cor de gráfico por status (barras empilhadas de estoque — F3B). Escala
// categórica distinta; `em_uso` é o azul da marca (token único --color-brand-azul,
// mesma cor da 2ª série dos gráficos). Consumido só em barras-empilhadas, como
// fill SVG / style.background / config de chart — todos aceitam CSS var.
export const STATUS_CHART_COLOR: Record<StatusAtivo, string> = {
  em_estoque: '#16a34a',
  reservado: '#7c3aed',
  em_uso: 'var(--color-brand-azul)',
  emprestado: '#0891b2',
  em_triagem: '#ea580c',
  em_manutencao: '#d97706',
  defasado: '#9ca3af',
  descartado: '#6b7280',
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

// ---------- ITEM POR QUANTIDADE (F3B) ----------
export type GrupoItem = Enums<'grupo_item'>
export type TipoLancamento = Enums<'tipo_lancamento'>

export const GRUPO_ITEM_META: Record<
  GrupoItem,
  { rotulo: string; titulo: string }
> = {
  acessorio: { rotulo: 'Acessório', titulo: 'Acessórios e periféricos' },
  componente: { rotulo: 'Componente', titulo: 'Componentes' },
}

export function rotuloGrupoItem(g: GrupoItem): string {
  return GRUPO_ITEM_META[g]?.rotulo ?? g
}

export const GRUPO_ITEM_ORDEM: GrupoItem[] = ['acessorio', 'componente']

// Semântica Total/Estoque (F6A §A4, decisão Johnny 16/07/2026). Os VALORES do enum
// são imutáveis (renomear quebraria histórico); a reconciliação é só de RÓTULO:
//   saida→Liberação (fica c/ a pessoa), reserva→Atrelar (vai retornar),
//   liberacao→Devolução (repõe estoque), retorno→Retorno (novo). `descricao` ajuda
//   o operador no dialog a entender o efeito de cada tipo.
export const TIPO_LANCAMENTO_META: Record<
  TipoLancamento,
  { rotulo: string; descricao: string }
> = {
  entrada: { rotulo: 'Entrada', descricao: 'Compra/recebimento — soma ao total e ao estoque.' },
  saida: { rotulo: 'Liberação', descricao: 'Item fica com a pessoa — baixa o estoque; o total continua.' },
  reserva: { rotulo: 'Atrelar', descricao: 'Acompanha um ativo/chamado e vai retornar — baixa o estoque.' },
  liberacao: { rotulo: 'Devolução', descricao: 'Item atrelado voltou — repõe o estoque.' },
  retorno: { rotulo: 'Retorno', descricao: 'Item liberado voltou para a prateleira — repõe o estoque.' },
  ajuste: { rotulo: 'Ajuste', descricao: 'Correção de inventário (± com justificativa).' },
}

export function rotuloTipoLancamento(t: TipoLancamento): string {
  return TIPO_LANCAMENTO_META[t]?.rotulo ?? t
}

export function descricaoTipoLancamento(t: TipoLancamento): string {
  return TIPO_LANCAMENTO_META[t]?.descricao ?? ''
}

// Pílula colorida da coluna Tipo no histórico: entrada azul, liberação(saida)
// âmbar, atrelar(reserva) violeta, devolução(liberacao) verde, retorno teal,
// ajuste neutro.
const TIPO_LANC_PILL: Record<TipoLancamento, string> = {
  entrada: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  saida: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  reserva: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  liberacao: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  retorno: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  ajuste: 'bg-muted text-muted-foreground',
}

export function pillTipoLancamento(t: TipoLancamento): string {
  return TIPO_LANC_PILL[t] ?? 'bg-muted text-muted-foreground'
}

// ---------- TERMO ----------
export const TERMO_META: Record<TermoStatus, { rotulo: string }> = {
  sim: { rotulo: 'Assinado' },
  enviado: { rotulo: 'Enviado (sem assinatura)' },
  // 'gerado' = documento emitido pelo sistema, ainda sem assinatura (F5A).
  // Continua contando como pendência (v_pendencias) — a cobrança não afrouxa.
  gerado: { rotulo: 'Gerado' },
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

// ---------- MARCADOR DA CARGA ÚNICA DE GO-LIVE (F4 → filtro F6A-A1) ----------
// A carga inicial (scripts/import/plano.ts, papel 'compra_inicial') gravou, para
// cada ativo, uma COMPRA sintética de abertura com esta observação EXATA. Não é
// evento do período — as leituras do relatório a excluem
// (src/lib/queries/relatorios/movimentacoes.ts). É a FONTE ÚNICA do literal
// (plano.ts importa daqui): mudá-lo re-exibiria ~1.576 linhas de abertura no
// relatório de produção. Igualdade EXATA de propósito — o AJUSTE de reconciliação
// usa 'carga go-live: estado conforme planilha…' (prefixo homônimo); um filtro
// por LIKE varreria os ajustes também. Nunca usar LIKE 'carga go-live%'.
export const OBS_CARGA_GOLIVE = 'carga go-live'

// ---------- MARCADOR DA CARGA DE SALDOS INICIAIS DE ITENS (F6C, futura) ----------
// A carga de saldos de itens por quantidade (scripts/import/carga.ts) marcará cada
// LANÇAMENTO inicial com esta observação EXATA. Não é movimentação do período — as
// leituras do relatório de itens a excluem (src/lib/queries/relatorios/itens.ts),
// mesma lição do A1. Igualdade EXATA de propósito; nunca filtrar por LIKE. É a
// FONTE ÚNICA do literal (a carga da F6C importará daqui).
export const OBS_SALDO_INICIAL = 'saldo inicial (go-live)'
