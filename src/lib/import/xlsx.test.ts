import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { lerXlsx, pareceXlsx } from './xlsx'
import {
  ErroArquivoImport,
  MAX_COLUNAS_PLANILHA,
  MAX_LINHAS_PLANILHA,
} from './limites'
import { validarArquivoImport, validarCsvImport } from './plano'
import type { FilialSelecionada } from './tipos'

// Testes do leitor de .xlsx (OS-F7G). Dados 100% fictícios (WAP…/"Fulano") — CLAUDE.md.
// As planilhas de fixture são construídas com o PRÓPRIO ExcelJS (write → buffer),
// então o teste exercita o round-trip real: célula de data escrita como Date volta
// como Date e é renderizada em dd/MM/aaaa; nada de mock.

const FILIAL: FilialSelecionada = { id: 1, slug: 'matriz', nome: 'Matriz' }
const HOJE = '2026-07-20'

// Cabeçalho REAL do layout Matriz (com `:` e acentos — prova a normalização do header).
const HEADER_MATRIZ = [
  'Site:', 'Marca:', 'Tipo:', 'Modelo:', 'Fornecedor:', 'Service tag', 'Patrimônio',
  'Memoria', 'Armazenamento', 'Processador', 'Hostname', 'Data de Entrega:',
  'Status', 'Situação', 'Data de Inclusão', 'Colaborador', 'Termo de Ativos', 'Observação:',
]

/** Serializa uma planilha (header + linhas, cada célula um valor ExcelJS) num buffer .xlsx. */
async function montarXlsx(header: unknown[], linhas: unknown[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Inventário')
  ws.addRow(header)
  for (const l of linhas) ws.addRow(l)
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}

function dataUTC(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia))
}

describe('pareceXlsx', () => {
  it('reconhece a assinatura ZIP do .xlsx e rejeita texto CSV', async () => {
    const xlsx = await montarXlsx(['a'], [['b']])
    expect(pareceXlsx(xlsx)).toBe(true)
    const csv = new TextEncoder().encode('a;b\r\nc;d')
    expect(pareceXlsx(csv)).toBe(false)
  })
})

describe('lerXlsx', () => {
  it('renderiza data (Date) como dd/MM/aaaa e número sem notação científica', async () => {
    const buf = await montarXlsx(
      ['Data de Inclusão', 'Nome', 'Service tag'],
      [[dataUTC(2025, 7, 8), 'Situação Jôão', 79000000]],
    )
    const csv = await lerXlsx(buf)
    expect(csv.header).toEqual(['Data de Inclusão', 'Nome', 'Service tag'])
    expect(csv.linhas).toHaveLength(1)
    expect(csv.linhas[0]!.linha).toBe(2) // header = 1, 1º dado = 2 (linha física)
    expect(csv.linhas[0]!.celulas).toEqual(['08/07/2025', 'Situação Jôão', '79000000'])
  })

  it('data formatada dd/mmm no Excel volta com o ANO real (o serial não perde o ano)', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('s')
    ws.addRow(['Data de Entrega'])
    const cell = ws.getCell('A2')
    cell.value = dataUTC(2025, 7, 8)
    cell.numFmt = 'dd/mmm' // exibe "08/jul" — mas o valor guardado é o serial completo
    const buf = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    const csv = await lerXlsx(buf)
    expect(csv.linhas[0]!.celulas[0]).toBe('08/07/2025')
  })

  it('preserva o número físico da linha quando há linha vazia no meio', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('s')
    ws.getCell('A1').value = 'Col'
    ws.getCell('A2').value = 'primeira'
    ws.getCell('A4').value = 'quarta' // linha 3 fica vazia
    const buf = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    const csv = await lerXlsx(buf)
    const linha4 = csv.linhas.find((l) => l.celulas[0] === 'quarta')
    expect(linha4?.linha).toBe(4)
  })
})

describe('validarArquivoImport — paridade CSV × XLSX', () => {
  // Mesmos dois ativos nos dois formatos: no xlsx as datas são Date; no CSV, os
  // MESMOS dd/MM/aaaa que o leitor renderiza. O plano resultante tem de ser idêntico.
  const linhasXlsx: unknown[][] = [
    [
      'Matriz', 'Dell', 'Notebook', 'Latitude 5490', 'WAP', 'ST-1', 'WAP0001234',
      '16GB', '512GB', 'i5', 'NB-1', dataUTC(2026, 3, 10),
      'Estoque', 'Guardada', dataUTC(2026, 2, 1), '', '', 'ok',
    ],
    [
      'Matriz', 'Samsung', 'Celular', 'Galaxy A54', 'WAP', 'ST-2', 'WAP0005678',
      '', '128GB', '', 'CEL-2', '',
      'Remanejo', 'Saída', dataUTC(2026, 1, 15), 'Fulano de Tal', '', '',
    ],
  ]
  const linhasCsv = [
    'Matriz;Dell;Notebook;Latitude 5490;WAP;ST-1;WAP0001234;16GB;512GB;i5;NB-1;10/03/2026;Estoque;Guardada;01/02/2026;;;ok',
    'Matriz;Samsung;Celular;Galaxy A54;WAP;ST-2;WAP0005678;;128GB;;CEL-2;;Remanejo;Saída;15/01/2026;Fulano de Tal;;',
  ]

  it('produz o mesmo plano a partir do .xlsx e do .csv equivalentes', async () => {
    const xlsxBuf = await montarXlsx(HEADER_MATRIZ, linhasXlsx)
    const csvTexto = [HEADER_MATRIZ.join(';'), ...linhasCsv].join('\r\n')
    const csvBuf = new TextEncoder().encode(csvTexto)

    const doXlsx = await validarArquivoImport(xlsxBuf, FILIAL, HOJE)
    const doCsv = validarCsvImport(csvBuf, FILIAL, HOJE)

    expect(doXlsx.bloqueantes).toEqual([])
    expect(doXlsx.plano).not.toBeNull()
    expect(doCsv.plano).not.toBeNull()
    // arquivoHash difere (buffers diferentes) — a igualdade é dos ATIVOS e do total.
    expect(doXlsx.plano!.ativos).toEqual(doCsv.plano!.ativos)
    expect(doXlsx.plano!.totalLinhasDados).toBe(doCsv.plano!.totalLinhasDados)
  })

  it('.xlsx cai no leitor xlsx e .csv no parser CSV (roteamento por conteúdo)', async () => {
    const xlsxBuf = await montarXlsx(HEADER_MATRIZ, linhasXlsx)
    const csvBuf = new TextEncoder().encode([HEADER_MATRIZ.join(';'), ...linhasCsv].join('\r\n'))
    expect(pareceXlsx(xlsxBuf)).toBe(true)
    expect(pareceXlsx(csvBuf)).toBe(false)
    // A entrada assíncrona resolve os dois sem lançar.
    await expect(validarArquivoImport(csvBuf, FILIAL, HOJE)).resolves.toBeTruthy()
  })
})

describe('lerXlsx — tetos de tamanho (dívida técnica item T, 30/08/2026)', () => {
  // ANTES desta correção o leitor TRUNCAVA em silêncio (`Math.min`): a linha 20.001 e a
  // coluna 41 sumiam sem aviso, e o passo seguinte do import apaga o acervo da filial e o
  // recria a partir do plano. Ativo que deixa de existir sem sinal. Agora recusa.
  //
  // As planilhas gigantes são montadas com linha ESPARSA (`getRow(n)` direto): o ExcelJS
  // guarda as linhas num mapa esparso, então `rowCount` = n sem materializar n linhas —
  // o teste fica em milissegundos e ainda exercita o caminho real do leitor.
  function planilhaComUltimaLinha(n: number): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('s')
    ws.getCell('A1').value = 'Patrimônio'
    ws.getCell(`A${n}`).value = 'WAP0001234'
    return wb.xlsx.writeBuffer().then((b) => new Uint8Array(b as ArrayBuffer))
  }

  it('recusa planilha com mais linhas de dados que o teto, dizendo o número e o limite', async () => {
    // header (1) + 20.001 linhas de dados
    const buf = await planilhaComUltimaLinha(MAX_LINHAS_PLANILHA + 2)
    await expect(lerXlsx(buf)).rejects.toBeInstanceOf(ErroArquivoImport)
    await expect(lerXlsx(buf)).rejects.toThrow('20.001 linhas')
    await expect(lerXlsx(buf)).rejects.toThrow('o limite do import é 20.000')
  })

  it('aceita a planilha EXATAMENTE no teto de linhas (o limite não é off-by-one)', async () => {
    const buf = await planilhaComUltimaLinha(MAX_LINHAS_PLANILHA + 1)
    const csv = await lerXlsx(buf)
    expect(csv.linhas).toHaveLength(MAX_LINHAS_PLANILHA)
    // e a ÚLTIMA linha continua chegando ao motor — é o que o truncamento comia
    expect(csv.linhas.at(-1)!.linha).toBe(MAX_LINHAS_PLANILHA + 1)
    expect(csv.linhas.at(-1)!.celulas[0]).toBe('WAP0001234')
  })

  it('recusa planilha mais larga que o teto de colunas em vez de cortar à direita', async () => {
    const header = Array.from({ length: MAX_COLUNAS_PLANILHA + 1 }, (_, i) => `Col ${i + 1}`)
    const buf = await montarXlsx(header, [['x']])
    await expect(lerXlsx(buf)).rejects.toBeInstanceOf(ErroArquivoImport)
    await expect(lerXlsx(buf)).rejects.toThrow('41 colunas')
  })

  it('aceita a planilha EXATAMENTE no teto de colunas', async () => {
    const header = Array.from({ length: MAX_COLUNAS_PLANILHA }, (_, i) => `Col ${i + 1}`)
    const buf = await montarXlsx(header, [['x']])
    const csv = await lerXlsx(buf)
    expect(csv.header).toHaveLength(MAX_COLUNAS_PLANILHA)
  })
})
