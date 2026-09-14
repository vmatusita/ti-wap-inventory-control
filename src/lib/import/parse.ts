// Parser do CSV de import (OS-F7 / W1). Extraído/adaptado de
// `scripts/import/parse.ts` (F4) para produção: decodificação (BOM UTF-8 →
// UTF-8; UTF-8 estrito; fallback cp1252 — o Excel da WAP exporta cp1252),
// PapaParse com `;`, validação de header por CONJUNTO de nomes normalizados
// (3 layouts: colunas18/colunas16/colunas20 — nomeados pela contagem de
// colunas, F56 · Frente D) e extração de registros CRUS com nº de linha.
// A normalização de VALORES fica em deparas.ts (também puro).

import Papa from 'papaparse'
import { normalizarHeader } from './deparas'
import type { LayoutImport } from './tipos'

// ---------------------------------------------------------------------------
// Decodificação — aceita o buffer bruto do arquivo (o W3 faz File.arrayBuffer()).

export type Encoding = 'utf-8' | 'windows-1252'

function paraBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  // Buffer é subclasse de Uint8Array — cai no primeiro ramo.
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

/** BOM UTF-8 → utf-8 (BOM removido); senão UTF-8 estrito; inválido → windows-1252. */
export function decodificarCsv(input: ArrayBuffer | Uint8Array): {
  texto: string
  encoding: Encoding
} {
  const buf = paraBytes(input)
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { texto: new TextDecoder('utf-8').decode(buf.subarray(3)), encoding: 'utf-8' }
  }
  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return { texto, encoding: 'utf-8' }
  } catch {
    const texto = new TextDecoder('windows-1252').decode(buf)
    return { texto, encoding: 'windows-1252' }
  }
}

// ---------------------------------------------------------------------------
// Parse bruto (linhas como arrays; linha 1 lógica = header)

export type CsvCru = {
  header: string[]
  /** [conteúdo aparado, nº da linha lógica no arquivo (1-based, header = 1)] */
  linhas: { celulas: string[]; linha: number }[]
}

/** Decodifica + PapaParse `;`. Erros fatais de parse viram Error.
 *
 * F56 (fato 3) — o PapaParse só emite o tipo de erro `'FieldMismatch'` quando a
 * opção `header: true` é usada (linha com nº de campos diferente do cabeçalho); a
 * chamada abaixo NÃO passa `header` (dados crus, como arrays — `header` fica
 * `false` por padrão), então esse tipo NUNCA aparece aqui. O filtro que excluía
 * `FieldMismatch` dos erros "fatais" era código morto desde sempre — removido. O
 * desalinhamento de linha (célula a mais/a menos que a largura útil do cabeçalho)
 * tem checagem PRÓPRIA (`linhasDesalinhadas`, Decisão 8 da F56), que não depende
 * do Papa: ele nunca notou esse problema, e continua sem notar. */
export function parseCsv(texto: string): CsvCru {
  const res = Papa.parse<string[]>(texto, {
    delimiter: ';',
    skipEmptyLines: false,
    dynamicTyping: false,
  })
  if (res.errors.length > 0) {
    throw new Error(`Falha ao ler o CSV: ${res.errors[0]!.message} (linha ${res.errors[0]!.row})`)
  }
  const dados = res.data
  if (dados.length === 0) return { header: [], linhas: [] }
  const header = (dados[0] ?? []).map((c) => c ?? '')
  const linhas = dados.slice(1).map((celulas, i) => ({
    celulas: (celulas ?? []).map((c) => (c ?? '').trim()),
    linha: i + 2,
  }))
  return { header, linhas }
}

// ---------------------------------------------------------------------------
// Layouts — validação por CONJUNTO de nomes normalizados (nunca posição).

const COLS_MATRIZ = [
  'site', 'marca', 'tipo', 'modelo', 'fornecedor', 'service tag', 'patrimonio',
  'memoria', 'armazenamento', 'processador', 'hostname', 'data de entrega',
  'status', 'situacao', 'data de inclusao', 'colaborador', 'termo de ativos', 'observacao',
]
const COLS_CD = COLS_MATRIZ.filter((c) => !['data de entrega', 'termo de ativos'].includes(c))
const COLS_PADRAO20 = [...COLS_MATRIZ, 'grade', 'glpi']

const LAYOUTS: Record<LayoutImport, string[]> = {
  colunas18: COLS_MATRIZ,
  colunas16: COLS_CD,
  colunas20: COLS_PADRAO20,
}

function conjuntoHeader(headers: string[]): Set<string> {
  return new Set(headers.map(normalizarHeader).filter((h) => h !== ''))
}

function iguais(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x))
}

export type DeteccaoLayout = {
  layout: LayoutImport | null
  /** Layout de menor diferença — usado na mensagem de erro e no resumo. */
  maisProximo: LayoutImport
  faltando: string[]
  sobrando: string[]
}

/**
 * Detecta o layout pelo conjunto de headers normalizados (tolera colunas vazias
 * à direita). Sem match exato → layout null + o layout mais próximo com a lista
 * de colunas faltando/sobrando (para a mensagem de bloqueante).
 */
export function detectarLayout(headers: string[]): DeteccaoLayout {
  const set = conjuntoHeader(headers)
  for (const nome of Object.keys(LAYOUTS) as LayoutImport[]) {
    if (iguais(set, new Set(LAYOUTS[nome]))) {
      return { layout: nome, maisProximo: nome, faltando: [], sobrando: [] }
    }
  }
  // sem match: escolhe o layout de menor diferença simétrica
  let melhor: LayoutImport = 'colunas18'
  let melhorDif = Infinity
  for (const nome of Object.keys(LAYOUTS) as LayoutImport[]) {
    const esperado = new Set(LAYOUTS[nome])
    const faltando = [...esperado].filter((c) => !set.has(c))
    const sobrando = [...set].filter((c) => !esperado.has(c))
    const dif = faltando.length + sobrando.length
    if (dif < melhorDif) melhorDif = dif
    else continue
    melhor = nome
  }
  const esperado = new Set(LAYOUTS[melhor])
  return {
    layout: null,
    maisProximo: melhor,
    faltando: [...esperado].filter((c) => !set.has(c)),
    sobrando: [...set].filter((c) => !esperado.has(c)),
  }
}

// ---------------------------------------------------------------------------
// Desalinhamento (F56 · Frente C, Decisão 8) — linha cujo nº de células não bate
// com a largura ÚTIL do cabeçalho é sinal de arquivo desalinhado (um `;` a mais ou
// a menos desloca todas as colunas seguintes), não erro de conteúdo de UMA célula.
// Estrutura não se corrige por célula — é o mesmo tratamento de `header_invalido`.

/** Índice da ÚLTIMA coluna do cabeçalho com nome (normalizado) + 1 — a largura
 *  ÚTIL. Colunas vazias à direita (separador sobrando) NÃO contam — o mesmo
 *  critério que `detectarLayout`/`conferirTetos` (`limites.ts`) já usam para
 *  tolerar cabeçalho com `;` a mais no fim. Cabeçalho 100% vazio → 0. */
export function larguraUtil(header: string[]): number {
  for (let i = header.length - 1; i >= 0; i--) {
    if (normalizarHeader(header[i]!) !== '') return i + 1
  }
  return 0
}

/** Uma linha do CSV/`.xlsx` cujo nº de células não bate com a largura útil do
 *  cabeçalho — célula A MAIS (com valor não vazio além da largura útil) ou célula
 *  A MENOS. `contagemCelulas` é o nº de células que a linha TEM (não o que sobra). */
export type LinhaDesalinhada = { linha: number; contagemCelulas: number; larguraUtil: number }

/**
 * Varre o `CsvCru` ORIGINAL (antes de qualquer correção — Decisão 8) procurando
 * linhas desalinhadas, pulando linha 100% vazia (mesmo critério de `linhaVazia`
 * abaixo — o `\n` final e a linha em branco do meio do arquivo viram `['']` com
 * `skipEmptyLines:false` e não são desalinhamento).
 *
 * No `.xlsx`, `lerLinha` (xlsx.ts) já entrega as células ALÉM do cabeçalho sem
 * truncar — é o que permite esta mesma régua acusar "valor à direita" nos dois
 * formatos; célula A MENOS não existe no `.xlsx` (a linha é sempre completada até
 * a largura lida). No CSV, o Papa preserva tanto a linha curta (`skipEmptyLines:
 * false` não completa) quanto a longa (não corta célula a mais) — os dois casos
 * chegam aqui intactos.
 */
export function linhasDesalinhadas(csv: CsvCru): LinhaDesalinhada[] {
  const largura = larguraUtil(csv.header)
  const achados: LinhaDesalinhada[] = []
  for (const { celulas, linha } of csv.linhas) {
    if (linhaVazia(celulas)) continue
    if (celulas.length > largura) {
      const sobrouValor = celulas.slice(largura).some((c) => c !== '')
      if (sobrouValor) achados.push({ linha, contagemCelulas: celulas.length, larguraUtil: largura })
    } else if (celulas.length < largura) {
      achados.push({ linha, contagemCelulas: celulas.length, larguraUtil: largura })
    }
  }
  return achados
}

// ---------------------------------------------------------------------------
// Registro cru (colunas por NOME; Termo de Ativos e Grade não são extraídos).

export type RegistroImport = {
  linha: number
  site: string
  marca: string
  tipo: string
  modelo: string
  fornecedor: string
  serviceTag: string
  patrimonio: string
  memoria: string
  armazenamento: string
  processador: string
  hostname: string
  dataEntrega: string
  status: string
  situacao: string
  dataInclusao: string
  colaborador: string
  glpi: string
  observacao: string
}

export type LinhaDescartada = { linha: number; conteudo: string }

/** Nome de coluna normalizado → índice físico. Exportada na F7B: o motor de
 *  correções escreve nas células pelo MESMO mapeamento usado aqui. */
export function mapaColunas(header: string[]): Map<string, number> {
  const mapa = new Map<string, number>()
  header.forEach((h, i) => {
    const nome = normalizarHeader(h)
    if (nome !== '' && !mapa.has(nome)) mapa.set(nome, i)
  })
  return mapa
}

function campo(celulas: string[], mapa: Map<string, number>, nome: string): string {
  const i = mapa.get(nome)
  return i === undefined ? '' : (celulas[i] ?? '')
}

/** Linha 100% vazia (todas as células em branco) — o mesmo critério usado por
 *  `extrairRegistros` (pula em silêncio) e por `linhasDesalinhadas` (Decisão 8:
 *  linha em branco / `\n` final não é desalinhamento). Exportada na F56. */
export function linhaVazia(celulas: string[]): boolean {
  return celulas.every((c) => c === '')
}

/**
 * Extrai registros crus do CSV já com layout válido. Linha 100% vazia é pulada
 * em silêncio; linha sem Site E sem patrimônio vai para `descartadas` (aviso no
 * chamador). `totalLinhasDados` = linhas não-vazias (registros + descartadas).
 */
export function extrairRegistros(csv: CsvCru): {
  registros: RegistroImport[]
  descartadas: LinhaDescartada[]
  totalLinhasDados: number
} {
  const mapa = mapaColunas(csv.header)
  const registros: RegistroImport[] = []
  const descartadas: LinhaDescartada[] = []
  let totalLinhasDados = 0
  for (const { celulas, linha } of csv.linhas) {
    if (linhaVazia(celulas)) continue
    totalLinhasDados++
    const site = campo(celulas, mapa, 'site')
    const patrimonio = campo(celulas, mapa, 'patrimonio')
    if (site === '' && patrimonio === '') {
      descartadas.push({ linha, conteudo: celulas.filter((c) => c !== '').join(' | ') })
      continue
    }
    registros.push({
      linha,
      site,
      marca: campo(celulas, mapa, 'marca'),
      tipo: campo(celulas, mapa, 'tipo'),
      modelo: campo(celulas, mapa, 'modelo'),
      fornecedor: campo(celulas, mapa, 'fornecedor'),
      serviceTag: campo(celulas, mapa, 'service tag'),
      patrimonio,
      memoria: campo(celulas, mapa, 'memoria'),
      armazenamento: campo(celulas, mapa, 'armazenamento'),
      processador: campo(celulas, mapa, 'processador'),
      hostname: campo(celulas, mapa, 'hostname'),
      dataEntrega: campo(celulas, mapa, 'data de entrega'),
      status: campo(celulas, mapa, 'status'),
      situacao: campo(celulas, mapa, 'situacao'),
      dataInclusao: campo(celulas, mapa, 'data de inclusao'),
      colaborador: campo(celulas, mapa, 'colaborador'),
      glpi: campo(celulas, mapa, 'glpi'),
      observacao: campo(celulas, mapa, 'observacao'),
    })
  }
  return { registros, descartadas, totalLinhasDados }
}
