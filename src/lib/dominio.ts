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
//
// F19-pós — POR QUE o VERDE usa `text-*-800` e os irmãos usam `text-*-700`:
// medido, `green-700` sobre `green-100` da o par mais fraco da familia inteira,
// 4,4996:1 — reprova AA por 0,0004 nos 11px do badge. Os demais passam
// (violeta 6,13 · azul 5,59 · teal 4,79 · ciano 4,71 · laranja 4,56 · ambar 6,41
// no 800 · cinza 6,11 · slate 8,40), entao so o verde desceu um degrau, para
// `green-800` (6,45:1). Nao e inconsistencia: e o mesmo ALVO de contraste com a
// tinta que cada matiz exige. Confira com `node scripts/contraste.mjs`.
export const STATUS_META: Record<
  StatusAtivo,
  { rotulo: string; badge: string }
> = {
  em_estoque: {
    rotulo: 'Em estoque',
    badge:
      'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-transparent',
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
  // F14: baixa terminal — o fornecedor ficou com o equipamento (não teve conserto).
  // Cinza-neutra de baixa, distinta do descartado (slate vs gray).
  devolvido_fornecedor: {
    rotulo: 'Devolvido ao fornecedor',
    badge:
      'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-transparent',
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
  devolvido_fornecedor: '#64748b',
}

// ---------- TIPO DE MOVIMENTACAO ----------
export const TIPO_META: Record<TipoMovimentacao, { rotulo: string }> = {
  compra: { rotulo: 'Compra' },
  troca: { rotulo: 'Troca' },
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
  devolucao_fornecedor: { rotulo: 'Devolução ao fornecedor' },
}

export function rotuloTipo(t: TipoMovimentacao): string {
  return TIPO_META[t]?.rotulo ?? t
}

// Pílula colorida da coluna Tipo nas tabelas de relatório (OS-F3 3.3.5):
// saída amarela, devolução azul, compra verde, troca teal; os demais tipos, neutro.
// F15: `troca` (nascimento do substituto) é distinta da `compra` (verde) — teal, com
// variante escura (AA claro/escuro, precedente F7F; mesmo teal de TIPO_LANC_PILL.retorno).
//
// F19 — saida/devolucao/compra nasceram sem par `dark:` (só `troca` tinha). Com o
// tema escuro ligado isso vira texto escuro sobre pílula clara cravada no card
// escuro. Pares idênticos aos de STATUS_META e TIPO_LANC_PILL, logo abaixo:
// bg-*-100 → dark:bg-*-950 · text-*-700|800 → dark:text-*-300.
// (O `compra` usa 800 pelo mesmo motivo medido do `em_estoque` — ver STATUS_META.)
const TIPO_PILL: Partial<Record<TipoMovimentacao, string>> = {
  saida: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  devolucao: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  compra: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  troca: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
}

// Neutro dos tipos sem cor própria. F19 — era `bg-muted text-muted-foreground`,
// que mede 4,34:1 e reprova AA nos 11px em que a pílula é renderizada. O par
// `gray-200/gray-600` (6,11:1 claro · 5,64:1 escuro) é o MESMO já usado pelo badge
// "descartado" de STATUS_META — reaproveitar mantém a família visual do neutro.
const PILL_NEUTRA =
  'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'

export function pillTipo(t: TipoMovimentacao): string {
  return TIPO_PILL[t] ?? PILL_NEUTRA
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
  'devolvido_fornecedor',
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
  liberacao: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  retorno: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  // F19 — mesmo neutro AA do `pillTipo` (ver PILL_NEUTRA).
  ajuste: PILL_NEUTRA,
}

export function pillTipoLancamento(t: TipoLancamento): string {
  return TIPO_LANC_PILL[t] ?? PILL_NEUTRA
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

// Ordem de exibição dos status de termo no <Select> da nova movimentação (espelha
// STATUS_ORDEM). FONTE ÚNICA da lista de opções — antes os 4 valores estavam
// hard-coded no JSX (passo-movimentacao.tsx), soltos do enum. Um teste
// (dominio.test.ts) trava que esta lista é uma permutação exata de
// `Constants.public.Enums.termo_status`: se um valor entrar/sair do enum do banco,
// o teste quebra e o select não fica mudo.
export const TERMO_STATUS_ORDEM: TermoStatus[] = ['sim', 'enviado', 'gerado', 'nao']

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

// ---------- DESFECHO DA PENDÊNCIA DE ITEM (F18 §B5) ----------
// Uma pendência de item faltante (tabela pendencias_item) encerra por ação MANUAL
// com um destes desfechos. Fonte única do vocabulário De→Para: o validator Zod
// (src/lib/validators/pendencia-item.ts) importa DESFECHOS_PENDENCIA_ITEM daqui, e
// a UI/CSV usa os rótulos abaixo. 'recuperado' = o item voltou; 'baixa' = não vai
// voltar (a mochila de desligamento que a empresa não cobra formalmente).
export const DESFECHOS_PENDENCIA_ITEM = ['recuperado', 'baixa'] as const
export type DesfechoPendenciaItem = (typeof DESFECHOS_PENDENCIA_ITEM)[number]

export const DESFECHO_PENDENCIA_ITEM_ROTULO: Record<DesfechoPendenciaItem, string> = {
  recuperado: 'Item recuperado',
  baixa: 'Baixa — não vai voltar',
}

export function rotuloDesfechoPendenciaItem(desfecho: string | null | undefined): string {
  if (!desfecho) return ''
  return DESFECHO_PENDENCIA_ITEM_ROTULO[desfecho as DesfechoPendenciaItem] ?? desfecho
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

// ---------- MARCADOR DA CARGA DE STARTUP POR CSV (F7 — import "Substituir tudo") ----------
// O import de startup por filial (RPC importar_ativos_substituir) grava, por ativo,
// uma COMPRA de abertura e — quando o estado-alvo não é 'em_estoque' — um AJUSTE de
// reconciliação. Esta observação, prefixada pela data (`import startup dd/MM/yyyy`),
// ESCONDE a movimentação das tabelas/série do relatório (leitura por PREFIXO em
// src/lib/queries/relatorios/movimentacoes.ts — `not.like 'import startup*'`).
//
// F8 (migration 0036, decisão do Johnny 20/07/2026): a COMPRA de abertura volta a levar
// SEMPRE o marcador — com OU sem data real —, escondida do relatório do período; a data
// real segue na própria compra (histórico as-of / ficha do ativo). Reverte a F7H (0035),
// que deixava a compra COM data escapar do marcador e aparecer nas Entradas: a planilha
// de startup não distingue "compra nova" de "saldo de abertura" (toda linha tem data).
// Compra "de verdade" é a LANÇADA MANUALMENTE no sistema pós-go-live (sem marcador →
// aparece nas Entradas). O AJUSTE segue SEMPRE com o marcador. Ver ESPECIFICACAO §10.2
// (Emenda F8).
//
// Diferente do OBS_CARGA_GOLIVE (igualdade exata), aqui o filtro é por PREFIXO porque
// a observação carrega a data variável do import. É a FONTE ÚNICA do literal do
// PREFIXO — mantenha em sincronia com a string hard-coded nas migrations 0032→0036.
export const OBS_IMPORT_STARTUP = 'import startup'

// ---------- PENDÊNCIA DE PATRIMÔNIO NULO (F7E — import sem plaqueta) ----------
// Ativo importado sem patrimônio físico (`""`/`n/a`/"SEM PATRIMONIO"…) nasce com
// `ativos.pendencia` contendo ESTE trecho. É o MESMO literal que o go-live F4 já
// gravou (a fila de pendências fica uma só) e o MESMO que a RPC
// importar_ativos_substituir (migration 0034) hard-coda no insert — mantenha em
// SINCRONIA com aquele SQL (precedente OBS_IMPORT_STARTUP). A pendência é
// `;`-joinable (ex.: 'sem patrimônio físico; termo pendente'): ao corrigir o
// patrimônio na ficha, remove-se só ESTE trecho, preservando os demais.
export const PENDENCIA_SEM_PATRIMONIO = 'sem patrimônio físico'

// ---------- PENDÊNCIA DE SERVICE TAG NULA (F15 C1 — import/cadastro sem tag) ----------
// Irmã de PENDENCIA_SEM_PATRIMONIO. Ativo IMPORTADO sem service tag nasce com
// `ativos.pendencia` contendo ESTE trecho (o cadastro MANUAL passa a EXIGIR a tag —
// Zod+action —, então só o import a produz). MESMO literal que a RPC
// importar_ativos_substituir (migration 0048) hard-coda — mantenha em SINCRONIA com
// aquele SQL (precedente PENDENCIA_SEM_PATRIMONIO / 0034). A pendência é `;`-joinable
// (ex.: 'sem patrimônio físico; sem service tag'): ao definir a service tag na ficha,
// remove-se só ESTE trecho, preservando os demais.
export const PENDENCIA_SEM_SERVICE_TAG = 'sem service tag'
