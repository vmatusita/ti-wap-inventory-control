// F56 · Frente C — mede os CINCO corpos que atravessam a Vercel (Decisão 6 do
// PLAN-F56.md) com o SERIALIZADOR REAL do Next (`encodeReply`/
// `renderToReadableStream`, o mesmo `react-server-dom-webpack` que o runtime usa
// para o pedido e a resposta de uma Server Action) e o MOTOR REAL de
// `src/lib/import` — a redução do orçamento de resposta (`orcamento.ts`,
// `aplicarOrcamentoResposta`) já roda DENTRO de `validarCsvImport`/
// `validarArquivoImport`; este script não simula nada, só mede o que sai de
// verdade.
//
// Reconstituído a partir de `harness.mts`/`xlsx-medir.mts` (medição C2,
// `docs/f56-evidencias/C2-conta-dos-corpos.txt` é a SAÍDA deste script, não o
// script em si — aquele era descartável por regra; este é VERSIONADO).
//
// Uso — SEMPRE com `--conditions=react-server` (o módulo servidor do Flight
// exige; sem isso, `require()` resolve o build ERRADO e quebra em runtime):
//   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/perf/medir-corpos-import.mts [modo]
// Modos: todos (padrão) | corpo2 | corpo3 | corpo1e4 | corpo5
//
// Dados 100% FICTÍCIOS (WAP9xxxxxx; nenhum nome de colaborador) — CLAUDE.md regra 2.
// Nenhuma escrita em banco; só serialização em memória.

import { createRequire } from 'node:module'
import ExcelJS from 'exceljs'
import { validarCsvImport, csvCorrigidoDeArquivo } from '../../src/lib/import/index'
import type { CorrecaoImport, FilialSelecionada } from '../../src/lib/import/tipos'

const require = createRequire(import.meta.url)
const clientMod = require('next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js')
const serverMod = require('next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js')

// ---------------------------------------------------------------------------
// Serializadores reais

async function bytesDoPedido(args: unknown[]): Promise<number> {
  const encoded = await clientMod.encodeReply(args)
  if (encoded instanceof FormData) {
    const req = new Request('http://x.invalid/', { method: 'POST', body: encoded })
    const buf = await req.arrayBuffer()
    return buf.byteLength
  }
  return Buffer.byteLength(encoded as string, 'utf8')
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
// Constantes do plano (LIMITES_CAMPO_PLANO, src/lib/import/limites.ts — números
// FINAIS da Decisão 6, iguais aos que a medição C2 já havia confirmado)

const FIELD_MAX = {
  marca: 60, modelo: 120, fornecedor: 80, serviceTag: 60, memoria: 40,
  armazenamento: 40, processador: 80, hostname: 60, observacao: 500,
  colaboradorNome: 120, setor: 80, chamado: 40, patrimonio: 60,
  lixo: 100, // representativo p/ Site/Tipo/Status/Situação "lixo" (sem .max() — MAX_BYTES_CONTEUDO cobre)
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
// Geradores de linha (espelham C2-tetos-remedidos.md §1 — bloqueante4/duplicata/
// avisos/site-único/válida)

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

function linhaAvisos(i: number, layout: Layout, scale: number, level: ContentLevel, style: Style): string[] {
  const L = (max: number) => len(max, scale, level)
  const grupo = (i % 3) as 0 | 1 | 2
  let patrimonioCru = ''
  let hostname = filler(L(FIELD_MAX.hostname), style)
  if (grupo === 0) {
    patrimonioCru = ''
  } else if (grupo === 1) {
    patrimonioCru = ''
    const emb = `WAP9${String(900000 + i).padStart(6, '0')}`
    hostname = `NB-${emb}`
  } else {
    patrimonioCru = `WAP9${String(i + 1).padStart(6, '0')}`
  }
  const serviceTag = `ST${i}` + filler(Math.max(0, L(FIELD_MAX.serviceTag) - String(i).length - 2), style)
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
  return headerDoLayout(layout).map((h) => csvCell(cells[h] ?? ''))
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

// ---------------------------------------------------------------------------
// §2 — corpo 2 (resposta de validarImport), cenários patológicos, N=2.000, teto

type Cenario = 'a_bloqueante4' | 'b_avisos' | 'c_duplicata' | 'd_sites_distintos' | 'valida'

function montarCenario(cenario: Cenario, n: number, layout: Layout, scale: number, level: ContentLevel, style: Style): Uint8Array {
  const linhas: string[][] = []
  for (let i = 0; i < n; i++) {
    if (cenario === 'a_bloqueante4') linhas.push(linhaBloqueante4(i, layout, scale, level, style, false))
    else if (cenario === 'b_avisos') linhas.push(linhaAvisos(i, layout, scale, level, style))
    else if (cenario === 'c_duplicata') linhas.push(linhaDuplicata(i, layout, scale, level, style))
    else if (cenario === 'd_sites_distintos') linhas.push(linhaBloqueante4(i, layout, scale, level, style, true))
    else linhas.push(linhaValida(i, layout, scale, level, style))
  }
  return montarCsv(layout, linhas)
}

async function medirCorpo2(n: number, layout: Layout): Promise<Record<string, unknown>[]> {
  const scaleTeto = escalaPara(n, 768 * 1024)
  const cenarios: Cenario[] = ['a_bloqueante4', 'b_avisos', 'c_duplicata', 'd_sites_distintos', 'valida']
  const linhas: Record<string, unknown>[] = []
  for (const cenario of cenarios) {
    const bytes = montarCenario(cenario, n, layout, scaleTeto, 'teto', 'ascii')
    const v = validarCsvImport(bytes, FILIAL, '2026-09-11', [], new Map())
    const json = Buffer.byteLength(JSON.stringify(v), 'utf8')
    const flight = await bytesDaResposta(v)
    linhas.push({
      cenario, n, bytesArquivo: bytes.byteLength, json, flight,
      flightSobreJson: +(flight / json).toFixed(3),
      bloqueantes: v.bloqueantes.length, avisos: v.avisos.length, grupos: v.grupos.length,
      totalBloqueantes: v.resumo.detalhe.totalBloqueantes, totalAvisos: v.resumo.detalhe.totalAvisos,
      reduzido: v.resumo.detalhe.reduzido, mantidosPorTipo: v.resumo.detalhe.mantidosPorTipo,
    })
  }
  return linhas
}

// ---------------------------------------------------------------------------
// §3 — corpo 3 (pedido de aplicarImport), pior caso ACEITO
//
// `substituir_estado` PARECE o mais caro, mas `para` é preso ao vocabulário de
// Situação (~10-12 caracteres reais) — usá-lo no teto de 120 vira
// `correcao_invalida` e derruba o plano (achado C2 §3.1). O pior tipo ACEITO é
// `substituir`/`tipo` com `de` que não casa NENHUMA célula real (no-op silencioso,
// nunca bloqueia), com os DOIS campos (`de`/`para`) no teto de 120.

async function medirCorpo3(n: number, budgetKiB: number, nCorrecoes: number, style: Style): Promise<Record<string, unknown>> {
  const scale = escalaPara(n, budgetKiB * 1024)
  const linhas: string[][] = []
  for (let i = 0; i < n; i++) {
    const row = linhaValida(i, 'padrao20', scale, 'teto', style)
    // Patrimônio FORÇADO cru de 60 caracteres, duplicado em patrimonioOriginal.
    const idxPatr = HEADER_PADRAO20.indexOf('Patrimônio')
    const cru = ('X' + String(i).padStart(6, '0') + 'Y').padEnd(60, 'Z')
    row[idxPatr] = csvCell(cru)
    linhas.push(row)
  }
  const bytes = montarCsv('padrao20', linhas)

  const correcoes: CorrecaoImport[] = []
  for (let i = 0; i < n; i++) correcoes.push({ op: 'forcar_patrimonio', linha: i + 2 })
  for (let k = 0; k < nCorrecoes; k++) {
    correcoes.push({
      op: 'substituir', campo: 'tipo',
      de: `ZZZNOMATCH-${k}-` + filler(120 - 13 - String(k).length, 'multibyte'),
      para: `PARA-${k}-` + filler(120 - 7 - String(k).length, 'multibyte'),
    })
  }

  const validacao = validarCsvImport(bytes, FILIAL, '2026-09-11', correcoes, new Map())
  const input = {
    plano: validacao.plano,
    confirmacaoTexto: FILIAL.nome,
    custoPreview: { ativos: n, movimentacoes: 0, anotacoes: 0, termos: 0 },
    correcoes,
  }
  const req = await bytesDoPedido([input])
  return {
    n, budgetKiB, nCorrecoes, bytesArquivo: bytes.byteLength, corpo3: req,
    planoOk: validacao.plano !== null, bloqueantes: validacao.bloqueantes.length,
  }
}

// ---------------------------------------------------------------------------
// §4 — corpos 1/4 (multipart real, File) — arquivo no teto de tamanho + correções

function csvNoTetoDeArquivo(alvoBytes: number, layout: Layout): { bytes: Uint8Array; n: number } {
  let n = Math.round(alvoBytes / 620)
  let bytes: Uint8Array = new Uint8Array()
  for (let iter = 0; iter < 8; iter++) {
    const linhas = Array.from({ length: n }, (_, i) => linhaValida(i, layout, 1, 'teto', 'ascii'))
    bytes = montarCsv(layout, linhas)
    if (Math.abs(bytes.byteLength - alvoBytes) / alvoBytes < 0.01) break
    n = Math.max(1, Math.round((n * alvoBytes) / bytes.byteLength))
  }
  return { bytes, n }
}

async function xlsxNoTetoDeArquivo(alvoBytes: number, layout: Layout): Promise<{ bytes: Uint8Array; n: number }> {
  async function montar(n: number): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Inventario')
    ws.addRow(headerDoLayout(layout))
    for (let i = 0; i < n; i++) {
      ws.addRow(linhaValida(i, layout, 1, 'teto', 'ascii').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')))
    }
    return new Uint8Array(
      (await wb.xlsx.writeBuffer({
        zip: { compression: 'DEFLATE', compressionOptions: { level: 6 } },
        useStyles: false,
      } as never)) as ArrayBuffer,
    )
  }
  let n = Math.round(alvoBytes / 200)
  let bytes = await montar(n)
  for (let iter = 0; iter < 8 && Math.abs(bytes.byteLength - alvoBytes) / alvoBytes >= 0.02; iter++) {
    n = Math.max(1, Math.round((n * alvoBytes) / bytes.byteLength))
    bytes = await montar(n)
  }
  return { bytes, n }
}

function correcoesNoTeto(n: number): CorrecaoImport[] {
  const correcoes: CorrecaoImport[] = []
  for (let k = 0; k < n; k++) {
    correcoes.push({
      op: 'substituir', campo: 'tipo',
      de: `ZZZNOMATCH-${k}-` + filler(120 - 13 - String(k).length, 'multibyte'),
      para: `PARA-${k}-` + filler(120 - 7 - String(k).length, 'multibyte'),
    })
  }
  return correcoes
}

async function medirCorpo1e4(alvoArquivoBytes: number): Promise<Record<string, unknown>[]> {
  const saida: Record<string, unknown>[] = []
  {
    const { bytes, n } = csvNoTetoDeArquivo(alvoArquivoBytes, 'padrao20')
    const fd = new FormData()
    fd.set('arquivo', new File([bytes as unknown as BlobPart], 'inventario.csv', { type: 'text/csv' }))
    fd.set('filialId', '1')
    fd.set('correcoes', JSON.stringify(correcoesNoTeto(500)))
    const bytesReq = await bytesDoPedido([fd])
    saida.push({ formato: 'csv', alvoArquivoBytes, n, bytesArquivoReal: bytes.byteLength, corpo1e4: bytesReq })
  }
  {
    const { bytes, n } = await xlsxNoTetoDeArquivo(alvoArquivoBytes, 'padrao20')
    const fd = new FormData()
    fd.set('arquivo', new File([bytes as unknown as BlobPart], 'inventario.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    fd.set('filialId', '1')
    fd.set('correcoes', JSON.stringify(correcoesNoTeto(500)))
    const bytesReq = await bytesDoPedido([fd])
    saida.push({ formato: 'xlsx', alvoArquivoBytes, n, bytesArquivoReal: bytes.byteLength, corpo1e4: bytesReq })
  }
  return saida
}

// ---------------------------------------------------------------------------
// §5 — corpo 5 (resposta de baixarCsvCorrigido) — pior escape

async function medirCorpo5(): Promise<Record<string, unknown>[]> {
  const casos = [
    { n: 2000, budgetKiB: 768, style: 'quotes' as Style },
    { n: 2000, budgetKiB: 1024, style: 'quotes' as Style },
    { n: 1142, budgetKiB: 768, style: 'quotes' as Style },
  ]
  const saida: Record<string, unknown>[] = []
  for (const c of casos) {
    const scale = escalaPara(c.n, c.budgetKiB * 1024)
    const linhas = Array.from({ length: c.n }, (_, i) => linhaValida(i, 'padrao20', scale, 'teto', c.style))
    const bytes = montarCsv('padrao20', linhas)
    const conteudo = await csvCorrigidoDeArquivo(bytes, [], FILIAL.nome)
    const resposta = { ok: true, nome: 'import-corrigido-matriz.csv', conteudo }
    const flight = await bytesDaResposta(resposta)
    const json = Buffer.byteLength(JSON.stringify(resposta), 'utf8')
    saida.push({ ...c, bytesArquivo: bytes.byteLength, bytesConteudoCorrigido: Buffer.byteLength(conteudo, 'utf8'), json, corpo5Flight: flight })
  }
  return saida
}

// ---------------------------------------------------------------------------

const LIMITE_CORPO_PLATAFORMA = 4_500_000
const FOLGA_MINIMA = 1.5
const TETO_COM_FOLGA = LIMITE_CORPO_PLATAFORMA / FOLGA_MINIMA

async function main() {
  const modo = process.argv[2] ?? 'todos'
  const resultado: Record<string, unknown> = {}

  if (modo === 'todos' || modo === 'corpo2') {
    console.error('medindo corpo2 (N=1.142)…')
    resultado.corpo2_n1142 = await medirCorpo2(1142, 'padrao20')
    console.error('medindo corpo2 (N=2.000)…')
    resultado.corpo2_n2000 = await medirCorpo2(2000, 'padrao20')
  }
  if (modo === 'todos' || modo === 'corpo3') {
    console.error('medindo corpo3…')
    resultado.corpo3 = [
      await medirCorpo3(2000, 768, 500, 'multibyte'),
      await medirCorpo3(2000, 768, 500, 'quotes'),
      await medirCorpo3(2000, 768, 1000, 'multibyte'),
      await medirCorpo3(2000, 512, 500, 'multibyte'),
      await medirCorpo3(2000, 1024, 500, 'multibyte'),
      await medirCorpo3(2000, 1024, 1000, 'multibyte'),
    ]
  }
  if (modo === 'todos' || modo === 'corpo1e4') {
    console.error('medindo corpo1/corpo4 (multipart real)…')
    resultado.corpo1e4 = await medirCorpo1e4(1 * 1024 * 1024)
  }
  if (modo === 'todos' || modo === 'corpo5') {
    console.error('medindo corpo5…')
    resultado.corpo5 = await medirCorpo5()
  }

  resultado.limites = { LIMITE_CORPO_PLATAFORMA, FOLGA_MINIMA, TETO_COM_FOLGA }
  console.log(JSON.stringify(resultado, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
