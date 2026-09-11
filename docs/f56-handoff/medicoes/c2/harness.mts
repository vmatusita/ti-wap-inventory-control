// F56 / Frente C (Medidor) — harness de medição dos 5 corpos do import, com o
// serializador REAL do Next (encodeReply / renderToReadableStream) e o motor REAL
// de src/lib/import. Rodou como zz-f56-c2-harness.mts na raiz do repo (gitignored
// por `zz-*`), apagado ao final de cada bateria de execuções — esta cópia arquivada
// em scratch é a referência p/ virar scripts/perf/medir-corpos-import.mjs na
// implementação. NUNCA editado no repo; nenhum dado real.
//
// Requer NODE_OPTIONS="--conditions=react-server" (o módulo servidor do Flight exige).
// Uso: NODE_OPTIONS="--conditions=react-server" node --import tsx <este arquivo> <modo>
// Modos: sweep1 | debug | layouts | degrau | corpo3 | corpo1e4 | corpo5 | contagem

import { createRequire } from 'node:module'
import ExcelJS from 'exceljs'
import { validarCsvImport, csvCorrigidoDeArquivo, validarArquivoImport } from '@/lib/import'
import type { CorrecaoImport, FilialSelecionada } from '@/lib/import'

const require = createRequire(import.meta.url)
const clientMod = require('next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js')
const serverMod = require('next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js')

// ---------------------------------------------------------------------------
// Serializadores reais

async function bytesDoPedido(args: unknown[]): Promise<{ bytes: number; forma: 'FormData' | 'string' }> {
  const encoded = await clientMod.encodeReply(args)
  if (encoded instanceof FormData) {
    const req = new Request('http://x.invalid/', { method: 'POST', body: encoded })
    const buf = await req.arrayBuffer()
    return { bytes: buf.byteLength, forma: 'FormData' }
  }
  return { bytes: Buffer.byteLength(encoded as string, 'utf8'), forma: 'string' }
}

async function bytesDaResposta(model: unknown): Promise<number> {
  const stream = serverMod.renderToReadableStream(model, {})
  const reader = (stream as ReadableStream<Uint8Array>).getReader()
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
  }
  return total
}

// ---------------------------------------------------------------------------
// Constantes do plano (PLAN-F56.md, Decisão 6 — CONTEXTO da ordem)

const FIELD_MAX = {
  marca: 60, modelo: 120, fornecedor: 80, serviceTag: 60, memoria: 40,
  armazenamento: 40, processador: 80, hostname: 60, observacao: 500,
  colaboradorNome: 120, setor: 80, chamado: 40, patrimonio: 60,
  lixo: 100, // representativo p/ Site/Tipo/Status/Situação "lixo" (sem .max() proposto)
}

const HEADER_MATRIZ = [
  'Site', 'Marca', 'Tipo', 'Modelo', 'Fornecedor', 'Service Tag', 'Patrimônio',
  'Memória', 'Armazenamento', 'Processador', 'Hostname', 'Data de Entrega',
  'Status', 'Situação', 'Data de Inclusão', 'Colaborador', 'Termo de Ativos', 'Observação',
]
const HEADER_PADRAO20 = [...HEADER_MATRIZ, 'Grade', 'GLPI']
const HEADER_CD = HEADER_MATRIZ.filter((h) => h !== 'Data de Entrega' && h !== 'Termo de Ativos')

type Layout = 'matriz' | 'padrao20' | 'cd'
function headerDoLayout(l: Layout): string[] {
  return l === 'matriz' ? HEADER_MATRIZ : l === 'padrao20' ? HEADER_PADRAO20 : HEADER_CD
}

const FILIAL: FilialSelecionada = { id: 1, slug: 'matriz', nome: 'Matriz' }

// ---------------------------------------------------------------------------
// Preenchimento de célula

const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua '
function asciiFiller(n: number): string {
  if (n <= 0) return ''
  let s = ''
  while (s.length < n) s += LOREM
  return s.slice(0, n)
}
const MB_UNIT = 'áàâãéêíóôõúçÀÉÍÓÚÇ€' // 2-3 bytes/char em UTF-8
function multibyteFiller(byteBudget: number): string {
  if (byteBudget <= 0) return ''
  let s = ''
  while (Buffer.byteLength(s, 'utf8') < byteBudget) s += MB_UNIT
  while (Buffer.byteLength(s, 'utf8') > byteBudget) s = s.slice(0, -1)
  return s
}
function quotesBarrasFiller(n: number): string {
  if (n <= 0) return ''
  const unit = 'a"b\\c/d;e '
  let s = ''
  while (s.length < n) s += unit
  return s.slice(0, n)
}
type Style = 'ascii' | 'multibyte' | 'quotes'
function filler(n: number, style: Style): string {
  if (style === 'multibyte') return multibyteFiller(n)
  if (style === 'quotes') return quotesBarrasFiller(n)
  return asciiFiller(n)
}
function csvCell(v: string): string {
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// ---------------------------------------------------------------------------
// Escala de conteúdo — orçamento total (bytes) / N / soma dos máximos de campo

const SOMA_MAX_LIVRE =
  FIELD_MAX.marca + FIELD_MAX.modelo + FIELD_MAX.fornecedor + FIELD_MAX.serviceTag +
  FIELD_MAX.memoria + FIELD_MAX.armazenamento + FIELD_MAX.processador + FIELD_MAX.hostname +
  FIELD_MAX.observacao + FIELD_MAX.colaboradorNome + FIELD_MAX.setor + FIELD_MAX.chamado +
  FIELD_MAX.patrimonio + 5 * FIELD_MAX.lixo // 5 campos "lixo": site,tipo,status,situacao,patrimonio-lixo

function escalaPara(n: number, budgetBytes: number): number {
  return Math.min(1, budgetBytes / (n * SOMA_MAX_LIVRE))
}

type ContentLevel = 'teto' | 'minimo'
function len(max: number, scale: number, level: ContentLevel): number {
  return level === 'minimo' ? Math.min(1, max) : Math.max(1, Math.floor(max * scale))
}

// ---------------------------------------------------------------------------
// Geradores de linha (ver corpo do relatório C2-tetos-remedidos.md §1 p/ a
// justificativa de cada cenário — bloqueante4/duplicata/avisos/site-único/valida)

function linhaValida(i: number, layout: Layout, scale: number, level: ContentLevel, style: Style): string[] {
  const L = (max: number) => len(max, scale, level)
  const patr = `WAP9${String(i + 1).padStart(6, '0')}`
  const cells: Record<string, string> = {
    'Site': 'Matriz',
    'Marca': filler(L(FIELD_MAX.marca), style),
    'Tipo': 'Notebook',
    'Modelo': filler(L(FIELD_MAX.modelo), style),
    'Fornecedor': filler(L(FIELD_MAX.fornecedor), style),
    'Service Tag': `ST${i}` + filler(Math.max(0, L(FIELD_MAX.serviceTag) - String(i).length - 2), style),
    'Patrimônio': patr,
    'Memória': filler(L(FIELD_MAX.memoria), style),
    'Armazenamento': filler(L(FIELD_MAX.armazenamento), style),
    'Processador': filler(L(FIELD_MAX.processador), style),
    'Hostname': 'NB-' + filler(Math.max(0, L(FIELD_MAX.hostname) - 3), style),
    'Data de Entrega': '',
    'Status': '',
    'Situação': 'Estoque',
    'Data de Inclusão': '01/03/2025',
    'Colaborador': '',
    'Termo de Ativos': '',
    'Observação': filler(L(FIELD_MAX.observacao), style),
    'Grade': '',
    'GLPI': '',
  }
  return headerDoLayout(layout).map((h) => csvCell(cells[h] ?? ''))
}

function linhaAvisos(i: number, layout: Layout, scale: number, level: ContentLevel, style: Style) {
  const L = (max: number) => len(max, scale, level)
  const grupo = (i % 3) as 0 | 1 | 2
  let patrimonioCru = ''
  let hostname = filler(L(FIELD_MAX.hostname), style)
  let patrimonioParaConflito: string | undefined
  let serviceTag = `ST${i}` + filler(Math.max(0, L(FIELD_MAX.serviceTag) - String(i).length - 2), style)
  if (grupo === 0) {
    patrimonioCru = ''
  } else if (grupo === 1) {
    patrimonioCru = ''
    const emb = `WAP9${String(900000 + i).padStart(6, '0')}`
    hostname = `NB-${emb}`
  } else {
    const p = `WAP9${String(i + 1).padStart(6, '0')}`
    patrimonioCru = p
    patrimonioParaConflito = p
  }
  const cells: Record<string, string> = {
    'Site': 'Matriz', 'Marca': filler(L(FIELD_MAX.marca), style), 'Tipo': 'Notebook',
    'Modelo': filler(L(FIELD_MAX.modelo), style), 'Fornecedor': filler(L(FIELD_MAX.fornecedor), style),
    'Service Tag': serviceTag, 'Patrimônio': patrimonioCru,
    'Memória': filler(L(FIELD_MAX.memoria), style), 'Armazenamento': filler(L(FIELD_MAX.armazenamento), style),
    'Processador': filler(L(FIELD_MAX.processador), style), 'Hostname': hostname,
    'Data de Entrega': '', 'Status': '', 'Situação': 'Saída', 'Data de Inclusão': '',
    'Colaborador': '', 'Termo de Ativos': '', 'Observação': filler(L(FIELD_MAX.observacao), style),
    'Grade': '', 'GLPI': '',
  }
  return {
    cells: headerDoLayout(layout).map((h) => csvCell(cells[h] ?? '')),
    grupo, patrimonio: patrimonioParaConflito, serviceTag: grupo === 2 ? serviceTag : undefined,
  }
}

function linhaBloqueante4(i: number, layout: Layout, scale: number, level: ContentLevel, style: Style, siteUnico: boolean): string[] {
  const L = (max: number) => len(max, scale, level)
  const Llixo = len(FIELD_MAX.lixo, scale, level)
  const site = siteUnico
    ? `LIXO-SITE-${i}-` + filler(Math.max(0, Llixo - 12 - String(i).length), style)
    : 'LIXO-SITE-' + filler(Math.max(0, Llixo - 10), style)
  const tipo = 'LIXO-TIPO-' + filler(Math.max(0, Llixo - 10), style)
  const statusSit = 'LIXO-ESTADO-' + filler(Math.max(0, Llixo - 12), style)
  const patrimonio = 'LIXO-PATR-' + filler(Math.max(0, Llixo - 10), style)
  const cells: Record<string, string> = {
    'Site': site, 'Marca': filler(L(FIELD_MAX.marca), style), 'Tipo': tipo,
    'Modelo': filler(L(FIELD_MAX.modelo), style), 'Fornecedor': filler(L(FIELD_MAX.fornecedor), style),
    'Service Tag': filler(L(FIELD_MAX.serviceTag), style), 'Patrimônio': patrimonio,
    'Memória': filler(L(FIELD_MAX.memoria), style), 'Armazenamento': filler(L(FIELD_MAX.armazenamento), style),
    'Processador': filler(L(FIELD_MAX.processador), style), 'Hostname': filler(L(FIELD_MAX.hostname), style),
    'Data de Entrega': '', 'Status': statusSit, 'Situação': statusSit, 'Data de Inclusão': '01/03/2025',
    'Colaborador': '', 'Termo de Ativos': '', 'Observação': filler(L(FIELD_MAX.observacao), style),
    'Grade': '', 'GLPI': '',
  }
  return headerDoLayout(layout).map((h) => csvCell(cells[h] ?? ''))
}

function linhaDuplicata(i: number, layout: Layout, scale: number, level: ContentLevel, style: Style): string[] {
  const L = (max: number) => len(max, scale, level)
  const cells: Record<string, string> = {
    'Site': 'Matriz', 'Marca': filler(L(FIELD_MAX.marca), style), 'Tipo': 'Notebook',
    'Modelo': filler(L(FIELD_MAX.modelo), style), 'Fornecedor': filler(L(FIELD_MAX.fornecedor), style),
    'Service Tag': 'ST-DUP-FIXA', 'Patrimônio': 'WAP9999999',
    'Memória': filler(L(FIELD_MAX.memoria), style), 'Armazenamento': filler(L(FIELD_MAX.armazenamento), style),
    'Processador': filler(L(FIELD_MAX.processador), style), 'Hostname': filler(L(FIELD_MAX.hostname), style),
    'Data de Entrega': '', 'Status': '', 'Situação': 'Estoque', 'Data de Inclusão': '01/03/2025',
    'Colaborador': '', 'Termo de Ativos': '', 'Observação': filler(L(FIELD_MAX.observacao), style),
    'Grade': '', 'GLPI': '',
  }
  return headerDoLayout(layout).map((h) => csvCell(cells[h] ?? ''))
}

function montarCsv(layout: Layout, linhas: string[][]): Uint8Array {
  const texto = [headerDoLayout(layout).join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n')
  return new TextEncoder().encode(texto)
}

// [O restante do arquivo — medirCenario, o DEGRAU (reduzirValidacao/medirDegrau),
//  medirCorpo3, medirCorpo1e4 (com csvNoTetoDeArquivo/xlsxNoTetoDeArquivo),
//  medirCorpo5, medirContagem e o dispatcher da CLI — está documentado por inteiro
//  no corpo do relatório C2-tetos-remedidos.md (§funções), pela mesma razão do
//  T1/T2: o arquivo executável em si foi apagado da raiz do repo ao final da
//  bateria (regra dura da ordem); esta cópia arquivada preserva os geradores de
//  fixture (a parte reaproveitável) e a assinatura de cada função de medição.]
