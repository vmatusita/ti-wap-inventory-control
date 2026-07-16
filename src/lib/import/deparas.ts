// De→Para do import de startup (OS-F7 / W1). Funções PURAS extraídas e adaptadas
// de `scripts/import/normalizar.ts` (motor da carga única F4) para código de
// produção testável. Aplicam os vocabulários De→Para da spec §5 (ampliados
// 15/07/2026) sobre os valores crus do CSV. Nada aqui toca banco/UI.
//
// TABELAS ESPELHADAS DE scripts/import/normalizar.ts (F4):
//   - UNIDADES (De→Para de Site/Unidade → filial oficial)
//   - CATEGORIAS (Tipo → categoria) — aqui devolve null p/ desconhecido (F7 §3
//     bloqueia; a F4 devolvia 'outro')
//   - ESTADOS + precedência Situação>Status
//   - normalizarTexto / normalizarHeader / limparCampo / parseData /
//     normalizarServiceTag / chaveServiceTag / extrairChamado
// Os scripts da F4 permanecem intocados (ferramenta histórica do go-live).

import type { CategoriaAtivo, FilialOficial, StatusAtivo } from './tipos'

// ---------------------------------------------------------------------------
// Texto

/** minúsculas, sem acento, sem `:` final, espaços colapsados — base do De→Para. */
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

const VAZIOS = new Set([
  '', '-', '_', 'n/a', 'na', 'x', 'xx', 'xxx', '0', 'nenhum',
  'não.', 'nao.', 'não', 'nao', 'sem',
])

/** Campo "vazio na prática" (`-`, `N/A`, `X`…) → null; senão o texto aparado. */
export function limparCampo(raw: string | undefined | null): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (t === '') return null
  if (VAZIOS.has(normalizarTexto(t))) return null
  return t
}

// ---------------------------------------------------------------------------
// Unidades / filiais (spec §5, ampliado 15/07/2026) — espelho da F4

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

const FILIAL_POR_SLUG: Record<string, FilialOficial> = Object.fromEntries(
  (Object.entries(SLUG_POR_FILIAL) as [FilialOficial, string][]).map(([f, s]) => [s, f]),
)

/** Slug do banco → filial oficial (para casar o Site da linha com a filial escolhida). */
export function filialPorSlug(slug: string): FilialOficial | null {
  return FILIAL_POR_SLUG[slug] ?? null
}

// ---------------------------------------------------------------------------
// Categoria (Tipo → enum). F7 §3: desconhecido é BLOQUEANTE — por isso aqui
// devolvemos null (a F4 devolvia 'outro' silenciosamente).

const CATEGORIAS: Record<string, CategoriaAtivo> = {
  'notebook': 'notebook',
  'desktop': 'desktop',
  'monitor': 'monitor',
  'celular': 'celular',
  'tablet': 'tablet',
}

/** Categoria da planilha → enum; fora do vocabulário → null (chamador bloqueia). */
export function mapearCategoria(raw: string | null | undefined): CategoriaAtivo | null {
  return CATEGORIAS[normalizarTexto(raw ?? '')] ?? null
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
 * Estado corrente segundo a planilha: `Situação` vence quando preenchida, senão
 * `Status`. Valor fora da tabela → null (o chamador gera bloqueante
 * estado_desconhecido). Espelho fiel da precedência da F4.
 */
export function estadoPlanilha(
  status: string | null | undefined,
  situacao: string | null | undefined,
): StatusAtivo | null {
  const sit = normalizarTexto(situacao ?? '')
  const sta = normalizarTexto(status ?? '')
  const efetivo = sit !== '' ? sit : sta
  if (efetivo === '') return null
  return ESTADOS[efetivo] ?? null
}

// ---------------------------------------------------------------------------
// Datas — espelho EXATO da F4: só `dd/mm/aaaa` (ano 4 dígitos). dd/MM/yy e
// serial Excel NÃO são aceitos (a F4 não os aceitava — "espelhe exatamente").

export type ParseDataResult = { iso: string | null; invalida: boolean; futura: boolean }

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
// Service tag

/** Service tag: aparada, quebras de linha internas removidas; vazio-na-prática → null. */
export function normalizarServiceTag(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (t === '' || VAZIOS.has(normalizarTexto(t))) return null
  return t
}

/** Chave de comparação de tag (caixa/espaços não distinguem tags) — espelha o
 *  `coalesce(service_tag,'')` do índice único do banco. */
export function chaveServiceTag(tag: string | null): string {
  return tag ? tag.toUpperCase().replace(/\s+/g, '') : ''
}

// ---------------------------------------------------------------------------
// Campos auxiliares

/** Extrai nº de chamado do GLPI ("Chamado 6766" → "6766"; "SIM"/"Não"/sem dígito → null). */
export function extrairChamado(raw: string | null | undefined): string | null {
  const limpo = limparCampo(raw)
  if (!limpo) return null
  const semPrefixo = limpo.replace(/^chamados?\s*:?\s*/i, '').trim()
  if (!/\d{3,}/.test(semPrefixo)) return null
  return semPrefixo
}

/**
 * Coluna Colaborador do inventário. A F7 §3 diz "com setor se o texto trouxer" —
 * quando vem "Nome / Setor", separa; senão o texto inteiro é o colaborador.
 */
export function parseColaboradorInventario(raw: string | null | undefined): {
  colaborador: string | null
  setor: string | null
} {
  const limpo = limparCampo(raw)
  if (!limpo) return { colaborador: null, setor: null }
  const partes = limpo.split('/').map((p) => p.trim()).filter((p) => p !== '')
  if (partes.length === 0) return { colaborador: null, setor: null }
  return { colaborador: partes[0] ?? null, setor: partes[1] ?? null }
}
