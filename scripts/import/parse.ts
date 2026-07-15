// Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10.
//
// Parse dos CSVs reais: decodificação (BOM UTF-8 com fallback cp1252 — o export
// de 15/07/2026 saiu em UTF-8 com BOM, ver DECISOES), PapaParse com `;`,
// validação de header por CONJUNTO de nomes normalizados (3 layouts de
// inventário + Saída + Devolução) e extração de registros CRUS com nº de linha.
// A normalização de valores fica em normalizar.ts/plano.ts (funções puras).

import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { detectarLayout, normalizarHeader, type LayoutInventario } from './normalizar'

// ---------------------------------------------------------------------------
// Decodificação

/** BOM UTF-8 → utf-8; senão tenta UTF-8 estrito; inválido → windows-1252. */
export function decodificarCsv(buf: Buffer): { texto: string; encoding: 'utf-8' | 'windows-1252' } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { texto: buf.subarray(3).toString('utf-8'), encoding: 'utf-8' }
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
// Parse bruto (linhas como arrays; linha 1 = header)

export type CsvCru = {
  arquivo: string
  encoding: 'utf-8' | 'windows-1252'
  header: string[]
  /** [conteúdo, nº da linha lógica no arquivo (1-based, header = 1)] */
  linhas: { celulas: string[]; linha: number }[]
}

export function parseCsvCru(path: string, nomeAmigavel?: string): CsvCru {
  const buf = readFileSync(path)
  const { texto, encoding } = decodificarCsv(buf)
  const res = Papa.parse<string[]>(texto, {
    delimiter: ';',
    skipEmptyLines: false,
    dynamicTyping: false,
  })
  const fatais = res.errors.filter((e) => e.type !== 'FieldMismatch')
  if (fatais.length > 0) {
    throw new Error(`Falha no parse de ${path}: ${fatais[0]!.message} (linha ${fatais[0]!.row})`)
  }
  const dados = res.data
  if (dados.length === 0) throw new Error(`Arquivo vazio: ${path}`)
  const header = dados[0]!.map((c) => c ?? '')
  const linhas = dados.slice(1).map((celulas, i) => ({
    celulas: celulas.map((c) => (c ?? '').trim()),
    linha: i + 2,
  }))
  return { arquivo: nomeAmigavel ?? path, encoding, header, linhas }
}

// ---------------------------------------------------------------------------
// Mapa de colunas por nome normalizado

function mapaColunas(header: string[]): Map<string, number> {
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

// ---------------------------------------------------------------------------
// Registros crus

export type RegistroInventario = {
  arquivo: string
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
  termoAtivos: string
  observacao: string
}

export type RegistroSaida = {
  arquivo: string
  linha: number
  data: string
  unidade: string
  categoria: string
  marcaModelo: string
  patrimonio: string
  tipoMovimentacao: string
  chamado: string
  colaboradorSetor: string
  tipo: string
  termoAssinado: string
}

export type RegistroDevolucao = {
  arquivo: string
  linha: number
  data: string
  unidade: string
  categoria: string
  marcaModelo: string
  patrimonio: string
  colaborador: string
  tipoEntrada: string
  itensFaltantes: string
  setor: string
  tipo: string
}

export type LinhaDescartada = { arquivo: string; linha: number; conteudo: string }

function linhaVazia(celulas: string[]): boolean {
  return celulas.every((c) => c === '')
}

/**
 * Valida o header do inventário contra os 3 layouts e extrai registros crus.
 * Header fora dos 3 layouts = arquivo trocado → Error (ordem 0.3).
 * Linhas 100% vazias são puladas em silêncio; linha sem Site E sem patrimônio
 * (sobra de edição, ex. célula solta de service tag) vai para `descartadas`.
 */
export function extrairInventario(csv: CsvCru): {
  layout: LayoutInventario
  registros: RegistroInventario[]
  descartadas: LinhaDescartada[]
} {
  const layout = detectarLayout(csv.header)
  if (layout === null || layout === 'saida' || layout === 'devolucao') {
    throw new Error(
      `${csv.arquivo}: header não corresponde a nenhum layout de INVENTÁRIO conhecido — arquivo trocado? ` +
      `Header lido: ${csv.header.filter((h) => h.trim() !== '').join(' | ')}`,
    )
  }
  const mapa = mapaColunas(csv.header)
  const registros: RegistroInventario[] = []
  const descartadas: LinhaDescartada[] = []
  for (const { celulas, linha } of csv.linhas) {
    if (linhaVazia(celulas)) continue
    const site = campo(celulas, mapa, 'site')
    const patrimonio = campo(celulas, mapa, 'patrimonio')
    if (site === '' && patrimonio === '') {
      descartadas.push({ arquivo: csv.arquivo, linha, conteudo: celulas.filter((c) => c !== '').join(' | ') })
      continue
    }
    registros.push({
      arquivo: csv.arquivo,
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
      termoAtivos: campo(celulas, mapa, 'termo de ativos'),
      observacao: campo(celulas, mapa, 'observacao'),
    })
  }
  return { layout, registros, descartadas }
}

export function extrairSaidas(csv: CsvCru): {
  registros: RegistroSaida[]
  descartadas: LinhaDescartada[]
} {
  if (detectarLayout(csv.header) !== 'saida') {
    throw new Error(
      `${csv.arquivo}: header não corresponde ao layout de SAÍDA — arquivo trocado? ` +
      `Header lido: ${csv.header.filter((h) => h.trim() !== '').join(' | ')}`,
    )
  }
  const mapa = mapaColunas(csv.header)
  const registros: RegistroSaida[] = []
  const descartadas: LinhaDescartada[] = []
  for (const { celulas, linha } of csv.linhas) {
    if (linhaVazia(celulas)) continue
    const data = campo(celulas, mapa, 'data da saida')
    const patrimonio = campo(celulas, mapa, 'patrimonio')
    if (data === '' && patrimonio === '') {
      descartadas.push({ arquivo: csv.arquivo, linha, conteudo: celulas.filter((c) => c !== '').join(' | ') })
      continue
    }
    registros.push({
      arquivo: csv.arquivo,
      linha,
      data,
      unidade: campo(celulas, mapa, 'unidade'),
      categoria: campo(celulas, mapa, 'categoria'),
      marcaModelo: campo(celulas, mapa, 'marca / modelo'),
      patrimonio,
      tipoMovimentacao: campo(celulas, mapa, 'tipo de movimentacao'),
      chamado: campo(celulas, mapa, 'chamado'),
      colaboradorSetor: campo(celulas, mapa, 'colaborador/setor'),
      tipo: campo(celulas, mapa, 'tipo'),
      termoAssinado: campo(celulas, mapa, 'termo assinado'),
    })
  }
  return { registros, descartadas }
}

export function extrairDevolucoes(csv: CsvCru): {
  registros: RegistroDevolucao[]
  descartadas: LinhaDescartada[]
} {
  if (detectarLayout(csv.header) !== 'devolucao') {
    throw new Error(
      `${csv.arquivo}: header não corresponde ao layout de DEVOLUÇÃO — arquivo trocado? ` +
      `Header lido: ${csv.header.filter((h) => h.trim() !== '').join(' | ')}`,
    )
  }
  const mapa = mapaColunas(csv.header)
  const registros: RegistroDevolucao[] = []
  const descartadas: LinhaDescartada[] = []
  for (const { celulas, linha } of csv.linhas) {
    if (linhaVazia(celulas)) continue
    const data = campo(celulas, mapa, 'data da devolucao')
    const patrimonio = campo(celulas, mapa, 'patrimonio')
    if (data === '' && patrimonio === '') {
      descartadas.push({ arquivo: csv.arquivo, linha, conteudo: celulas.filter((c) => c !== '').join(' | ') })
      continue
    }
    registros.push({
      arquivo: csv.arquivo,
      linha,
      data,
      unidade: campo(celulas, mapa, 'unidade'),
      categoria: campo(celulas, mapa, 'categoria'),
      marcaModelo: campo(celulas, mapa, 'marca / modelo'),
      patrimonio,
      colaborador: campo(celulas, mapa, 'colaborador'),
      tipoEntrada: campo(celulas, mapa, 'tipo de entrada'),
      itensFaltantes: campo(celulas, mapa, 'itens faltantes'),
      setor: campo(celulas, mapa, 'setor'),
      tipo: campo(celulas, mapa, 'tipo'),
    })
  }
  return { registros, descartadas }
}
