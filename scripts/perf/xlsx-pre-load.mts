// F56 · Frente C — mede o `lerXlsx` REAL (`src/lib/import/xlsx.ts`) depois da
// Decisão 7 (o teto pré-load do XML descomprimido, `confirmarTamanhoDescomprimido`),
// em PROCESSO FILHO, com teto de heap — NUNCA no processo da sessão. Confirma:
// (i) um `.xlsx` LEGÍTIMO no teto de conteúdo passa rápido e com RSS baixo;
// (ii) uma bomba DISFARÇADA (dimensão pequena, célula gigante repetitiva) é
//      recusada em milissegundos, com RSS baixo — nunca chega perto do
//      `wb.xlsx.load`;
// (iii) uma bomba "ALTA" (muitas linhas, conteúdo curto — decomprime pouco: NÃO
//      estoura `MAX_XML_DESCOMPRIMIDO`, então o teto pré-load DEIXA passar, por
//      desenho) é pega pela segunda linha de defesa, `conferirTetos`
//      (`MAX_LINHAS_PLANILHA`), DEPOIS do `load` — mais lenta, mas sem risco de
//      memória (RSS fica na casa de centenas de MB, não GB).
//
// Cada CASO roda em processo filho SEPARADO (RSS de processo é cumulativo — medir
// os três no mesmo processo contaminaria a leitura de um com a alocação do outro).
//
// Uso (sempre em processo filho, com --max-old-space-size):
//   node --max-old-space-size=<N> --import tsx scripts/perf/xlsx-pre-load.mts <caso>
// Casos: legitimo | legitimo-com-formatacao | disfarcada | alta-lerxlsx | alta-pipeline-completo
//
// Nenhuma fixture é commitada — tudo em memória. Dados 100% fictícios.

import ExcelJS from 'exceljs'
import { lerXlsx } from '../../src/lib/import/xlsx'
import { validarArquivoImport } from '../../src/lib/import/plano'
import { ErroArquivoImport } from '../../src/lib/import/limites'
import type { FilialSelecionada } from '../../src/lib/import/tipos'

const FILIAL: FilialSelecionada = { id: 1, slug: 'matriz', nome: 'Matriz' }

function amostrarRss(): { parar: () => number } {
  let pico = process.memoryUsage().rss
  const h = setInterval(() => {
    const r = process.memoryUsage().rss
    if (r > pico) pico = r
  }, 10)
  return { parar: () => { clearInterval(h); return pico } }
}

async function medir<T>(nome: string, fn: () => Promise<T>): Promise<void> {
  const t0 = performance.now()
  const amostra = amostrarRss()
  try {
    const r = await fn()
    const t = performance.now() - t0
    const rss = amostra.parar()
    console.log(JSON.stringify({
      caso: nome, rejeitado: false, resultado: r,
      tempoMs: +t.toFixed(2), picoRssMB: +(rss / 1024 / 1024).toFixed(1),
    }))
  } catch (err) {
    const t = performance.now() - t0
    const rss = amostra.parar()
    console.log(JSON.stringify({
      caso: nome, rejeitado: true,
      erroTipo: err instanceof ErroArquivoImport ? 'ErroArquivoImport' : (err as Error)?.constructor?.name,
      erroMensagem: (err as Error)?.message?.slice(0, 220),
      tempoMs: +t.toFixed(2), picoRssMB: +(rss / 1024 / 1024).toFixed(1),
    }))
  }
}

// -------- fixtures --------

/**
 * `.xlsx` legítimo no teto de conteúdo (768 KiB, igual a `gerarLegitimoNoTeto`)
 * MAIS formatação (preenchimento) em milhares de linhas VAZIAS além dos dados —
 * o caso que a Decisão 7 pede para CONFIRMAR (formatação em linha vazia pode
 * inflar o XML sem dado nenhum, e é exatamente o motivo de NÃO usar `<dimension>`
 * como teto: ela contaria essas linhas como "dado"). Aqui o teste é o INVERSO —
 * confirmar que mesmo com essa formatação o XML descomprimido continua BEM
 * abaixo de `MAX_XML_DESCOMPRIMIDO` (32 MiB), sem precisar contar linha nenhuma.
 */
async function gerarLegitimoComFormatacaoEmLinhasVazias(): Promise<Uint8Array> {
  const nRows = 2000
  const nCols = 40
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Inventario')
  ws.addRow(Array.from({ length: nCols }, (_, c) => `Coluna${c + 1}`))
  const bytesPorCelula = Math.max(1, Math.floor((768 * 1024) / (nRows * nCols)))
  for (let r = 0; r < nRows; r++) {
    const linha = Array.from({ length: nCols }, () => `WAP9${String(r).padStart(6, '0')}-${'x'.repeat(Math.max(0, bytesPorCelula - 12))}`)
    ws.addRow(linha)
  }
  // O hábito real do Excel: selecionar a coluna inteira (ou milhares de linhas
  // "por via das dúvidas") e aplicar preenchimento/borda — sem dado nenhum.
  const linhaFinal = nRows + 1
  const linhaFormatadaAte = linhaFinal + 8000 // 8.000 linhas vazias FORMATADAS
  for (let r = linhaFinal + 1; r <= linhaFormatadaAte; r++) {
    for (let c = 1; c <= nCols; c++) {
      ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
      ws.getCell(r, c).border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
    }
  }
  const buf = await wb.xlsx.writeBuffer({
    zip: { compression: 'DEFLATE', compressionOptions: { level: 6 } },
    useStyles: true, // precisa estar LIGADO — é o estilo que queremos medir
  } as never)
  return new Uint8Array(buf as ArrayBuffer)
}

/** .xlsx legítimo no teto de conteúdo (768 KiB via MAX_BYTES_CONTEUDO): 2.000
 *  linhas × 40 colunas, células curtas (padrão de inventário real). */
async function gerarLegitimoNoTeto(): Promise<Uint8Array> {
  const nRows = 2000
  const nCols = 40
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Inventario')
  ws.addRow(Array.from({ length: nCols }, (_, c) => `Coluna${c + 1}`))
  const bytesPorCelula = Math.max(1, Math.floor((768 * 1024) / (nRows * nCols)))
  for (let r = 0; r < nRows; r++) {
    const linha = Array.from({ length: nCols }, () => `WAP9${String(r).padStart(6, '0')}-${'x'.repeat(Math.max(0, bytesPorCelula - 12))}`)
    ws.addRow(linha)
  }
  const buf = await wb.xlsx.writeBuffer({
    zip: { compression: 'DEFLATE', compressionOptions: { level: 6 } },
    useStyles: false,
  } as never)
  return new Uint8Array(buf as ArrayBuffer)
}

/** Bomba DISFARÇADA (achado C2/C4): dimensão pequena/legítima (3×1), célula
 *  massivamente repetitiva — comprime a poucos KB, descomprime bem acima de
 *  `MAX_XML_DESCOMPRIMIDO` (32 MiB). Alvo ~45 MB descomprimidos (não os ~300 MB
 *  que a medição C2 usou noutro processo — aqui o alvo é só ficar CLARAMENTE
 *  acima do teto sem estressar a geração da fixture dentro do heap deste
 *  processo filho). */
async function gerarBombaDisfarcada(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Disfarcada')
  ws.addRow(['C1'])
  const base = 'A'.repeat(15_000_000 - 8) // ~15M chars/linha × 3 linhas ≈ 45 MB
  for (let r = 0; r < 3; r++) ws.addRow([`${base}${String(r).padStart(8, '0')}`])
  const buf = await wb.xlsx.writeBuffer({
    zip: { compression: 'DEFLATE', compressionOptions: { level: 9 } },
    useStyles: false,
  } as never)
  return new Uint8Array(buf as ArrayBuffer)
}

/** Bomba "ALTA" (tall-narrow clássica): muitas linhas, valor CURTO repetido — o
 *  conteúdo descomprimido é modesto (não estoura `MAX_XML_DESCOMPRIMIDO`); quem
 *  pega isto é `MAX_LINHAS_PLANILHA`, na segunda linha de defesa
 *  (`conferirTetos`, chamada de `analisar()` DEPOIS do `lerXlsx`/`load`). */
async function gerarBombaAlta(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Alta')
  ws.addRow(['A', 'B', 'C'])
  for (let r = 0; r < 100_000; r++) ws.addRow(['WAP0001234', 'WAP0001234', 'WAP0001234'])
  const buf = await wb.xlsx.writeBuffer({
    zip: { compression: 'DEFLATE', compressionOptions: { level: 9 } },
    useStyles: false,
  } as never)
  return new Uint8Array(buf as ArrayBuffer)
}

async function main() {
  const caso = process.argv[2]

  // Timeout de segurança — nunca deve disparar de propósito (a defesa PRÉ-load é
  // rápida por desenho; o caso `alta-pipeline-completo` carrega de verdade, mas
  // 100k linhas curtas não deveria passar de poucos segundos).
  const relogio = setTimeout(() => {
    console.error(JSON.stringify({ erroFatal: 'timeout de segurança (30s)' }))
    process.exit(1)
  }, 30_000)
  relogio.unref()

  if (caso === 'legitimo') {
    const bytes = await gerarLegitimoNoTeto()
    console.error(JSON.stringify({ bytesArquivo: bytes.byteLength }))
    await medir('xlsx-legitimo-no-teto-de-conteudo', async () => {
      const csv = await lerXlsx(bytes)
      return { linhas: csv.linhas.length, colunas: csv.header.length }
    })
  } else if (caso === 'legitimo-com-formatacao') {
    const bytes = await gerarLegitimoComFormatacaoEmLinhasVazias()
    console.error(JSON.stringify({ bytesArquivo: bytes.byteLength }))
    // Confirmação da Decisão 7: um `.xlsx` legítimo (no teto de CONTEÚDO) que
    // também traz formatação em milhares de linhas vazias continua BEM abaixo
    // de MAX_XML_DESCOMPRIMIDO — não deveria ser recusado.
    await medir('legitimo-no-teto-com-formatacao-em-8000-linhas-vazias', async () => {
      const csv = await lerXlsx(bytes)
      return { linhas: csv.linhas.length, colunas: csv.header.length }
    })
  } else if (caso === 'disfarcada') {
    const bytes = await gerarBombaDisfarcada()
    console.error(JSON.stringify({ bytesArquivo: bytes.byteLength }))
    await medir('bomba-disfarcada-dimensao-3x1-celula-gigante-45mb-descomprimidos', async () => {
      const csv = await lerXlsx(bytes)
      return { linhas: csv.linhas.length } // nunca deveria chegar aqui
    })
  } else if (caso === 'alta-lerxlsx') {
    const bytes = await gerarBombaAlta()
    console.error(JSON.stringify({ bytesArquivo: bytes.byteLength }))
    // `lerXlsx` sozinho: o teto PRÉ-load não recusa (conteúdo descomprimido é
    // modesto) — por desenho. A recusa vem da 2ª linha de defesa, abaixo.
    await medir('bomba-alta-100000-linhas-so-lerXlsx-sem-conferirTetos', async () => {
      const csv = await lerXlsx(bytes)
      return { linhas: csv.linhas.length }
    })
  } else if (caso === 'alta-pipeline-completo') {
    const bytes = await gerarBombaAlta()
    console.error(JSON.stringify({ bytesArquivo: bytes.byteLength }))
    // Pipeline REAL (`validarArquivoImport` → `analisar()` → `conferirTetos`):
    // a 2ª linha de defesa (`MAX_LINHAS_PLANILHA`) pega depois do `load`.
    await medir('bomba-alta-100000-linhas-pipeline-completo-conferirTetos', async () => {
      const v = await validarArquivoImport(bytes, FILIAL, '2026-09-11')
      return { bloqueantes: v.bloqueantes.map((b) => b.tipo) }
    })
  } else {
    console.error('caso desconhecido — use: legitimo | legitimo-com-formatacao | disfarcada | alta-lerxlsx | alta-pipeline-completo')
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
