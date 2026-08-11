// Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10.
//
// Motor de normalização da carga única (F4): funções PURAS que aplicam os
// De→Para da spec §5 (ampliados em 15/07/2026) sobre os valores crus das
// planilhas. Nada aqui toca banco ou filesystem — tudo testável no Vitest.

import { canonicalizarPatrimonio } from '../../src/lib/patrimonio'
import type {
  CategoriaAtivo,
  FilialOficial,
  StatusAtivo,
  TermoStatus,
  TipoMovimentacao,
} from './tipos'

// ---------------------------------------------------------------------------
// Texto

/** minúsculas, sem acento, sem `:` final, espaços colapsados — base de todo De→Para */
export function normalizarTexto(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/:$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cabeçalho: normalizarTexto após tirar `:`/espaços à direita (headers reais têm `Site:`). */
export function normalizarHeader(raw: string): string {
  return normalizarTexto(raw.replace(/[:\s]+$/, ''))
}

const VAZIOS = new Set(['', '-', '_', 'n/a', 'na', 'x', 'xx', 'xxx', '0', 'nenhum', 'não.', 'nao.', 'não', 'nao', 'sem'])

/** Campo "vazio na prática" (`-`, `N/A`, `X`…) → null; senão o texto aparado. */
export function limparCampo(raw: string | undefined | null): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (t === '') return null
  if (VAZIOS.has(normalizarTexto(t))) return null
  return t
}

// ---------------------------------------------------------------------------
// Layouts (validação de header por CONJUNTO de nomes normalizados — nunca posição)

const COLS_MATRIZ = [
  'site', 'marca', 'tipo', 'modelo', 'fornecedor', 'service tag', 'patrimonio',
  'memoria', 'armazenamento', 'processador', 'hostname', 'data de entrega',
  'status', 'situacao', 'data de inclusao', 'colaborador', 'termo de ativos', 'observacao',
]
const COLS_CD = COLS_MATRIZ.filter(
  (c) => !['data de entrega', 'termo de ativos'].includes(c),
)
const COLS_FILIAL = [...COLS_MATRIZ, 'grade', 'glpi']
const COLS_SAIDA = [
  'data da saida', 'unidade', 'categoria', 'marca / modelo', 'patrimonio',
  'tipo de movimentacao', 'chamado', 'colaborador/setor', 'tipo', 'termo assinado',
]
const COLS_DEVOLUCAO = [
  'data da devolucao', 'unidade', 'categoria', 'marca / modelo', 'patrimonio',
  'colaborador', 'tipo de entrada', 'itens faltantes', 'setor', 'tipo',
]

export type LayoutInventario = 'matriz' | 'cd' | 'filial'

function conjuntosIguais(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x))
}

/** Detecta o layout pelo conjunto de headers normalizados (tolera colunas vazias à direita). */
export function detectarLayout(
  headers: string[],
): LayoutInventario | 'saida' | 'devolucao' | null {
  const set = new Set(headers.map(normalizarHeader).filter((h) => h !== ''))
  if (conjuntosIguais(set, new Set(COLS_MATRIZ))) return 'matriz'
  if (conjuntosIguais(set, new Set(COLS_CD))) return 'cd'
  if (conjuntosIguais(set, new Set(COLS_FILIAL))) return 'filial'
  if (conjuntosIguais(set, new Set(COLS_SAIDA))) return 'saida'
  if (conjuntosIguais(set, new Set(COLS_DEVOLUCAO))) return 'devolucao'
  return null
}

// ---------------------------------------------------------------------------
// Patrimônio (spec §5 + ordem 3.1.1)

const SEM_PATRIMONIO = new Set(['', '-', 'n/a', 'na', 'x', 'xx', 'xxx', '0', 'sem patrimonio', 'sem'])

/** Prefixos reais das planilhas (spec §5) — inferências só confiam nestes. */
export const PREFIXOS_CONHECIDOS = new Set(['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO'])

/** true quando o valor canoniza para um patrimônio de prefixo CONHECIDO. */
export function parecePatrimonioConhecido(canonico: string | null): canonico is string {
  if (!canonico) return false
  const prefixo = canonico.replace(/\d+$/, '')
  return PREFIXOS_CONHECIDOS.has(prefixo)
}

export type ParsePatrimonioResult =
  | { ok: true; canonico: string; original: string; prefixoCorrigido?: boolean; inferidoPor?: 'hostname' | 'vistos' }
  | { ok: false; semPatrimonio: true; original: string }
  | { ok: false; semPatrimonio: false; original: string; motivo: 'nao_parseavel' | 'bare_sem_inferencia' | 'bare_ambiguo' }

/**
 * Canoniza patrimônio (`WAP4491`→`WAP0004491`). Só dígitos → infere prefixo
 * 1º pelo Hostname da própria linha, 2º por match único contra `vistos`
 * (canônicos já resolvidos de todos os arquivos). `STFC`→`STF` (typo real).
 */
export function parsePatrimonio(
  raw: string | null | undefined,
  hostname?: string | null,
  vistos?: ReadonlySet<string>,
): ParsePatrimonioResult {
  const original = (raw ?? '').trim()
  if (SEM_PATRIMONIO.has(normalizarTexto(original))) {
    return { ok: false, semPatrimonio: true, original }
  }
  let bruto = original
  let prefixoCorrigido = false
  if (/^stfc/i.test(bruto)) {
    bruto = bruto.replace(/^stfc/i, 'STF')
    prefixoCorrigido = true
  }
  const canonico = canonicalizarPatrimonio(bruto)
  if (canonico) return { ok: true, canonico, original, prefixoCorrigido }

  // Só dígitos: inferência de prefixo
  const soDigitos = bruto.replace(/[\s.]/g, '')
  if (/^\d{1,7}$/.test(soDigitos)) {
    const alvo = soDigitos.replace(/^0+/, '') || '0'
    // 1º: hostname da própria linha (costuma ser o patrimônio canônico);
    // só confia em prefixo conhecido (um hostname "WW224001" não vira prefixo)
    const hostBruto = hostname ? canonicalizarPatrimonio(hostname) : null
    const hostCanonico = parecePatrimonioConhecido(hostBruto) ? hostBruto : null
    if (hostCanonico) {
      const numHost = hostCanonico.slice(-7).replace(/^0+/, '') || '0'
      if (numHost === alvo) {
        return { ok: true, canonico: hostCanonico, original, inferidoPor: 'hostname' }
      }
    }
    // 2º: match único contra os já vistos (número igual ignorando zeros)
    if (vistos && vistos.size > 0) {
      const matches = new Set(
        [...vistos].filter((v) => (v.slice(-7).replace(/^0+/, '') || '0') === alvo),
      )
      if (matches.size === 1) {
        return { ok: true, canonico: [...matches][0]!, original, inferidoPor: 'vistos' }
      }
      if (matches.size > 1) {
        return { ok: false, semPatrimonio: false, original, motivo: 'bare_ambiguo' }
      }
    }
    return { ok: false, semPatrimonio: false, original, motivo: 'bare_sem_inferencia' }
  }
  return { ok: false, semPatrimonio: false, original, motivo: 'nao_parseavel' }
}

/** Service tag: aparada, quebras de linha internas removidas; vazio-na-prática → null. */
export function normalizarServiceTag(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (t === '' || VAZIOS.has(normalizarTexto(t))) return null
  return t
}

/** Chave de comparação de tag (caixa/eventuais espaços não distinguem tags). */
export function chaveServiceTag(tag: string | null): string {
  return tag ? tag.toUpperCase().replace(/\s+/g, '') : ''
}

// ---------------------------------------------------------------------------
// Datas

export type ParseDataResult = { iso: string | null; invalida: boolean; futura: boolean }

/**
 * `dd/mm/aaaa` (e variações com espaços). Vazio/N-A → null SEM aviso; lixo
 * (`#######`, `XX`, `24/06/205`, `01/set`, nomes, service tags) → null + invalida.
 * Data futura (> hoje) → iso preenchido + futura=true (aviso; excluída da
 * escolha da data de compra inicial).
 */
const DATA_VAZIA = new Set(['', '-', 'n/a', 'na'])

export function parseData(raw: string | null | undefined, hoje: string): ParseDataResult {
  const t = (raw ?? '').trim()
  if (DATA_VAZIA.has(normalizarTexto(t))) {
    return { iso: null, invalida: false, futura: false }
  }
  const m = t.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/)
  if (!m) return { iso: null, invalida: true, futura: false }
  const dia = Number(m[1])
  const mes = Number(m[2])
  const ano = Number(m[3])
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return { iso: null, invalida: true, futura: false }
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return { iso: null, invalida: true, futura: false }
  }
  const iso = `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return { iso, invalida: false, futura: iso > hoje }
}

// ---------------------------------------------------------------------------
// Unidades / filiais (spec §5, ampliado 15/07/2026)

const UNIDADES: Record<string, FilialOficial> = {
  'matriz': 'Matriz',
  'matriz sao marcos': 'Matriz',
  'cd-afp': 'CD-Afonso Pena',
  'cd afp': 'CD-Afonso Pena',
  'cd-pena': 'CD-Afonso Pena',
  'cd pena': 'CD-Afonso Pena',
  'cd-afonso pena': 'CD-Afonso Pena',
  'cd afonso pena': 'CD-Afonso Pena',
  'cd-afonsopena': 'CD-Afonso Pena',
  'afonso pena': 'CD-Afonso Pena',
  'eusebio': 'Eusébio',
  'filial-ce': 'Eusébio',
  'filial ce': 'Eusébio',
  'serra': 'Serra',
  'serra park': 'Serra',
  'linhares': 'Linhares',
  'filial - linhares': 'Linhares',
  'filial linhares': 'Linhares',
}

export function mapearUnidade(raw: string | null | undefined): FilialOficial | null {
  const t = normalizarTexto(raw ?? '')
  return UNIDADES[t] ?? null
}

export const SLUG_POR_FILIAL: Record<FilialOficial, string> = {
  'Matriz': 'matriz',
  'CD-Afonso Pena': 'cd-afonso-pena',
  'Linhares': 'linhares',
  'Eusébio': 'eusebio',
  'Serra': 'serra',
}

// ---------------------------------------------------------------------------
// Categoria

const CATEGORIAS: Record<string, CategoriaAtivo> = {
  'notebook': 'notebook',
  'desktop': 'desktop',
  'monitor': 'monitor',
  'celular': 'celular',
  'tablet': 'tablet',
}

/** Categoria da planilha → enum; fora do vocabulário (ex.: Teclado) → `outro`. */
export function normalizarCategoria(raw: string | null | undefined): CategoriaAtivo {
  return CATEGORIAS[normalizarTexto(raw ?? '')] ?? 'outro'
}

// ---------------------------------------------------------------------------
// Motivos (spec §5 + decisões F4 registradas em DECISOES.md)

export type MotivoResult = {
  tipo: TipoMovimentacao
  motivo: string | null
  aviso: 'motivo_vazio' | 'motivo_desconhecido' | null
  /** texto cru a preservar em movimentacoes.observacao (regra "nada vira outro silencioso") */
  preservarTexto: string | null
}

const MOTIVOS_SAIDA: Record<string, string> = {
  'novo colaborador': 'novo_colaborador',
  'nova contratacao': 'novo_colaborador',
  'colaborador nao tinha equipamento': 'novo_colaborador',
  'associado ao colaborador': 'novo_colaborador',
  'troca': 'troca_upgrade',
  'troca/upgrade': 'troca_upgrade',
  'toca': 'troca_upgrade',
  'troca de equipamento': 'troca_upgrade',
  'troca de funcao': 'troca_upgrade', // decisão F4 (caso real 1×)
  'monitor adicional': 'monitor_adicional',
  'adicional de monitor': 'monitor_adicional',
  'equipamento compartilhado': 'uso_compartilhado',
  'uso interno': 'uso_compartilhado',
  'troca de titular': 'troca_titular',
  'reposicao': 'reposicao',
  'assistencia': 'assistencia',
  'outro': 'outro',
}

/**
 * Coluna `Tipo` da planilha de Saída. "Transferência Uni." e "Empréstimo" NÃO
 * são motivos — reclassificam o tipo da movimentação (ordem 3.1.5).
 * Vazio/`-`/`XX` → `outro` + aviso (84 casos reais); texto livre → inconsistência.
 */
export function mapearMotivoSaida(raw: string | null | undefined): MotivoResult {
  const cru = (raw ?? '').trim()
  const t = normalizarTexto(cru)
  if (t === '' || t === '-' || t === 'xx' || t === 'x') {
    return { tipo: 'saida', motivo: 'outro', aviso: 'motivo_vazio', preservarTexto: null }
  }
  if (t.startsWith('transferencia')) {
    return { tipo: 'transferencia', motivo: null, aviso: null, preservarTexto: null }
  }
  if (t === 'emprestimo') {
    return { tipo: 'emprestimo', motivo: null, aviso: null, preservarTexto: null }
  }
  const codigo = MOTIVOS_SAIDA[t]
  if (codigo) return { tipo: 'saida', motivo: codigo, aviso: null, preservarTexto: null }
  return { tipo: 'saida', motivo: 'outro', aviso: 'motivo_desconhecido', preservarTexto: cru }
}

const MOTIVOS_DEVOLUCAO: Record<string, string> = {
  'desligamento': 'desligamento',
  'deligamento': 'desligamento',
  'troca': 'troca_upgrade',
  'troca/upgrade': 'troca_upgrade',
  'afastamento': 'afastamento',
  'emprestimo': 'fim_emprestimo',
  'empretimo': 'fim_emprestimo', // typo real ("Emprétimo")
  'fim de emprestimo': 'fim_emprestimo',
  'manutencao': 'manutencao',
  'garantia': 'garantia',
  'assistencia': 'manutencao', // decisão F4: retorno de assistência externa (1 caso real)
  'outro': 'outro',
}

/**
 * Coluna `Tipo` da planilha de Devolução. `Tipo de entrada` = "Compra" já foi
 * reclassificado antes (vira movimentação `compra` — 20 casos).
 */
export function mapearMotivoDevolucao(raw: string | null | undefined): MotivoResult {
  const cru = (raw ?? '').trim()
  const t = normalizarTexto(cru)
  if (t === '' || t === '-' || t === 'xx' || t === 'x') {
    return { tipo: 'devolucao', motivo: 'outro', aviso: 'motivo_vazio', preservarTexto: null }
  }
  const codigo = MOTIVOS_DEVOLUCAO[t]
  if (codigo) return { tipo: 'devolucao', motivo: codigo, aviso: null, preservarTexto: null }
  return { tipo: 'devolucao', motivo: 'outro', aviso: 'motivo_desconhecido', preservarTexto: cru }
}

// ---------------------------------------------------------------------------
// Termo de responsabilidade

export type TermoResult = { status: TermoStatus; data: string | null; aviso: 'termo_invalido' | null }

/**
 * `sim`/`Sim!` → sim; `enviado`/`Termo enviado` → enviado; data (`15/12/2025`)
 * → enviado + data; `N/A`/vazio/`Não` → nao; nº de chamado na coluna (caso
 * real `2413`) → nao + aviso.
 */
export function mapearTermo(raw: string | null | undefined, hoje: string): TermoResult {
  const cru = (raw ?? '').trim()
  const t = normalizarTexto(cru)
  if (t === '' || VAZIOS.has(t)) return { status: 'nao', data: null, aviso: null }
  if (t === 'sim' || t === 'sim!') return { status: 'sim', data: null, aviso: null }
  if (t.includes('enviado')) return { status: 'enviado', data: null, aviso: null }
  const data = parseData(cru, hoje)
  if (data.iso) return { status: 'enviado', data: data.iso, aviso: null }
  if (/^\d+$/.test(t)) return { status: 'nao', data: null, aviso: 'termo_invalido' }
  return { status: 'nao', data: null, aviso: 'termo_invalido' }
}

// ---------------------------------------------------------------------------
// Estado da planilha (spec §4; precedência Situação > Status — DECISOES 15/07)

const ESTADOS: Record<string, StatusAtivo> = {
  'saida': 'em_uso',
  'remanejo': 'em_uso',
  'guardada': 'em_estoque',
  'estoque': 'em_estoque',
  'reservada': 'reservado',
  'reservado': 'reservado',
  'emprestimo': 'emprestado',
  'validar': 'em_triagem',
  'devolvido': 'em_triagem',
  'devolucao': 'em_triagem',
  'manutencao': 'em_manutencao',
  'rt wap': 'defasado',
  'posse wap': 'defasado',
  'defasada': 'defasado',
  'defasado': 'defasado',
  'descarte': 'descartado',
  'descartado': 'descartado',
}

/**
 * Estado corrente segundo a planilha: `Situação` vence quando preenchida,
 * senão `Status` (≈200 linhas conflitam — precedência registrada em DECISOES).
 * Valor fora da tabela → null (o chamador gera `estado_desconhecido`).
 */
export function estadoPlanilha(status: string | null | undefined, situacao: string | null | undefined): StatusAtivo | null {
  const sit = normalizarTexto(situacao ?? '')
  const sta = normalizarTexto(status ?? '')
  const efetivo = sit !== '' ? sit : sta
  if (efetivo === '') return null
  return ESTADOS[efetivo] ?? null
}

// ---------------------------------------------------------------------------
// Máquina de estados (espelho fiel de status_apos_movimentacao — migration 0109, que
// recriou a função sobre o corpo vigente da 0047; 0109 é a base atual, não a 0004
// original). Este espelho NÃO é o De→Para de import (dicionário ESTADOS, acima) — é
// consumido por scripts/import/plano.ts e scripts/import/carga.ts para simular o
// trigger e decidir se gera um `ajuste` de reconciliação. Mexer numa das duas (a
// função no banco ou esta tabela) SEM mexer na outra deixa a ferramenta desatualizada:
// religada, ela grava ajuste espúrio ou deixa de gravar o ajuste que faltava.
const TRANSICOES: Partial<Record<TipoMovimentacao, { de: StatusAtivo[]; para: StatusAtivo | 'mantem' }>> = {
  compra: { de: ['em_estoque'], para: 'em_estoque' },
  saida: { de: ['em_estoque', 'reservado', 'em_triagem'], para: 'em_uso' },
  emprestimo: { de: ['em_estoque', 'reservado'], para: 'emprestado' },
  // F34: reserva passa a valer também sobre reservado -> reservado (a RE-RESERVA, troca
  // de colaborador/setor/chamado sem estorno e sem ajuste).
  reserva: { de: ['em_estoque', 'reservado'], para: 'reservado' },
  // F34: a devolucao passa a pousar direto em em_estoque (era em_triagem) — a triagem
  // virou opt-in manual via envio_triagem, abaixo.
  devolucao: { de: ['em_uso', 'emprestado'], para: 'em_estoque' },
  // F34: tipo novo — a triagem manual opt-in (em_estoque -> em_triagem).
  envio_triagem: { de: ['em_estoque'], para: 'em_triagem' },
  triagem_ok: { de: ['em_triagem'], para: 'em_estoque' },
  envio_manutencao: { de: ['em_estoque', 'em_triagem', 'em_uso', 'defasado'], para: 'em_manutencao' },
  retorno_manutencao: { de: ['em_manutencao'], para: 'em_estoque' },
  marcar_defasado: { de: ['em_estoque', 'em_triagem', 'em_manutencao'], para: 'defasado' },
  descarte: { de: ['em_estoque', 'em_triagem', 'em_manutencao', 'defasado'], para: 'descartado' },
}

/**
 * Simula a transição que o trigger do banco aplicará. Retorna o novo status ou
 * null se inválida (replay: loga `estado_divergente`, pula e segue — ordem 3.2.4b).
 */
export function statusAposMovimentacao(
  atual: StatusAtivo,
  tipo: TipoMovimentacao,
  statusResultante?: StatusAtivo | null,
): StatusAtivo | null {
  if (tipo === 'ajuste') return statusResultante ?? null
  if (tipo === 'transferencia') return atual === 'descartado' ? null : atual
  if (tipo === 'estorno') return null // não existe no plano de carga
  const t = TRANSICOES[tipo]
  if (!t) return null
  return t.de.includes(atual) ? t.para === 'mantem' ? atual : t.para : null
}

/** Efeito da movimentação sobre colaborador/setor do ativo (espelho do trigger 0023). */
export function colaboradorAposMovimentacao(
  atual: { colaborador: string | null; setor: string | null },
  tipo: TipoMovimentacao,
  novo: { colaborador: string | null; setor: string | null },
): { colaborador: string | null; setor: string | null } {
  if (tipo === 'saida' || tipo === 'emprestimo' || tipo === 'reserva') return { ...novo }
  if (tipo === 'devolucao' || tipo === 'triagem_ok' || tipo === 'descarte' || tipo === 'envio_manutencao') {
    return { colaborador: null, setor: null }
  }
  return { ...atual }
}

// ---------------------------------------------------------------------------
// Campos auxiliares das planilhas de movimentação

/** Extrai nº de chamado ("Chamado 6766" → "6766"; "N/A"/"Não"/texto sem dígito → null). */
export function extrairChamado(raw: string | null | undefined): string | null {
  const limpo = limparCampo(raw)
  if (!limpo) return null
  const semPrefixo = limpo.replace(/^chamados?\s*:?\s*/i, '').trim()
  if (!/\d{3,}/.test(semPrefixo)) return null
  return semPrefixo
}

/** "Nome / Setor / resto…" → { colaborador, setor, resto (p/ observação) }. */
export function parseColaboradorSetor(raw: string | null | undefined): {
  colaborador: string | null
  setor: string | null
  resto: string | null
} {
  const limpo = limparCampo(raw)
  if (!limpo) return { colaborador: null, setor: null, resto: null }
  const partes = limpo.split('/').map((p) => p.trim()).filter((p) => p !== '')
  if (partes.length === 0) return { colaborador: null, setor: null, resto: null }
  return {
    colaborador: partes[0] ?? null,
    setor: partes[1] ?? null,
    resto: partes.length > 2 ? partes.slice(2).join(' / ') : null,
  }
}

const ITENS_OK = new Set([
  'certo', 'nenhum', 'ok', 'completo', 'entregue completo e instalado', 'entregue completo', '',
])
const PALAVRAS_ITEM = [
  'mochila', 'mouse', 'mousepad', 'mouse pad', 'teclado', 'carregador', 'fone',
  'monitor', 'cabo', 'capinha', 'pelicula', 'película', 'fonte', 'chip', 'suporte', 'headset',
]

export type ItensFaltantesResult = {
  itens: string[] | null
  /** texto que não é lista de itens (ex.: "Troca de maquina/Upgrade") → vai p/ observação */
  textoLivre: string | null
}

/**
 * Checklist de itens faltantes da Devolução. "Certo"/"Nenhum"/"Entregue
 * completo…" → nada faltando; lista com palavras de item → array; texto livre
 * sem item reconhecível → observação + aviso (não vira pendência falsa).
 */
export function parseItensFaltantes(raw: string | null | undefined): ItensFaltantesResult {
  const limpo = limparCampo(raw)
  if (!limpo) return { itens: null, textoLivre: null }
  const t = normalizarTexto(limpo)
  if (ITENS_OK.has(t) || t.startsWith('entregue completo')) return { itens: null, textoLivre: null }
  const contemItem = PALAVRAS_ITEM.some((p) => t.includes(p))
  if (!contemItem) return { itens: null, textoLivre: limpo }
  const itens = limpo
    .split(/[,/]/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && normalizarTexto(p) !== 'sem')
  return { itens: itens.length > 0 ? itens : null, textoLivre: null }
}

/** Destino de "Transferência Uni." embutido no texto de Colaborador/Setor. */
export function destinoTransferencia(colabRaw: string | null | undefined): FilialOficial | null {
  const t = normalizarTexto(colabRaw ?? '')
  if (t === '') return null
  if (t.includes('linhares')) return 'Linhares'
  if (t.includes('serra')) return 'Serra'
  if (t.includes('eusebio') || t.includes('filial-ce') || t.includes('filial ce')) return 'Eusébio'
  if (t.includes('afonso pena') || t.includes('cd-afp') || t.includes('cd afp') || t.includes('cd-pena')) return 'CD-Afonso Pena'
  if (t.includes('matriz')) return 'Matriz'
  return null
}

/** GLPI do inventário (nº de chamado; "SIM"/"Não"/texto sem dígito → null). */
export function extrairGlpi(raw: string | null | undefined): string | null {
  return extrairChamado(raw)
}

/** Marca/modelo dos inferidos ("Dell Latitude 3440" → marca+modelo; sem marca conhecida → só modelo). */
const MARCAS = new Set([
  'dell', 'samsung', 'xiaomi', 'motorola', 'apple', 'iphone', 'avell', 'hp',
  'lg', 'aoc', 'acer', 'lenovo', 'asus', 'positivo', 'intel', 'multilaser',
])
export function separarMarcaModelo(raw: string | null | undefined): { marca: string | null; modelo: string | null } {
  const limpo = limparCampo(raw)
  if (!limpo) return { marca: null, modelo: null }
  const [primeira, ...resto] = limpo.split(/\s+/)
  if (primeira && MARCAS.has(normalizarTexto(primeira)) && resto.length > 0) {
    return { marca: primeira, modelo: resto.join(' ') }
  }
  return { marca: null, modelo: limpo }
}
