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
import type { VocabularioImport } from './vocabulario'

// Testes do leitor de .xlsx (OS-F7G). Dados 100% fictícios (WAP…/"Fulano") — CLAUDE.md.
// As planilhas de fixture são construídas com o PRÓPRIO ExcelJS (write → buffer),
// então o teste exercita o round-trip real: célula de data escrita como Date volta
// como Date e é renderizada em dd/MM/aaaa; nada de mock.

const FILIAL: FilialSelecionada = { id: 1, slug: 'matriz', nome: 'Matriz' }
const HOJE = '2026-07-20'

// F56 · Frente D — o vocabulário deixou de ser hardcoded; o motor recebe
// `VocabularioImport` por parâmetro. Fixture mínima (só o que este arquivo usa).
const VOCAB: VocabularioImport = {
  filiais: [{ id: FILIAL.id, nome: FILIAL.nome, ativa: true }],
  apelidos: [],
  categorias: [
    { termo: 'notebook', categoria: 'notebook', rotulo: 'Notebook' },
    { termo: 'desktop', categoria: 'desktop', rotulo: 'Desktop' },
    { termo: 'monitor', categoria: 'monitor', rotulo: 'Monitor' },
    { termo: 'celular', categoria: 'celular', rotulo: 'Celular' },
    { termo: 'tablet', categoria: 'tablet', rotulo: 'Tablet' },
  ],
  estados: [
    { termo: 'saida', estado: 'em_uso', rotulo: 'Saída' },
    { termo: 'remanejo', estado: 'em_uso', rotulo: null },
    { termo: 'guardada', estado: 'em_estoque', rotulo: null },
    { termo: 'estoque', estado: 'em_estoque', rotulo: 'Estoque' },
    { termo: 'reservado', estado: 'reservado', rotulo: 'Reservado' },
    { termo: 'emprestimo', estado: 'emprestado', rotulo: 'Empréstimo' },
    { termo: 'validar', estado: 'em_triagem', rotulo: 'Validar' },
    { termo: 'manutencao', estado: 'em_manutencao', rotulo: 'Manutenção' },
    { termo: 'defasado', estado: 'defasado', rotulo: 'Defasado' },
    { termo: 'descartado', estado: 'descartado', rotulo: null },
  ],
  prefixosPatrimonio: ['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO'],
}

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

    const doXlsx = await validarArquivoImport(xlsxBuf, FILIAL, VOCAB, HOJE)
    const doCsv = validarCsvImport(csvBuf, FILIAL, VOCAB, HOJE)

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
    await expect(validarArquivoImport(csvBuf, FILIAL, VOCAB, HOJE)).resolves.toBeTruthy()
  })
})

describe('lerXlsx × conferirTetos — tetos de tamanho (dívida técnica item T, 30/08/2026; unificados na F56 · Frente C)', () => {
  // ANTES desta correção o leitor TRUNCAVA em silêncio (`Math.min`): a linha 2.001 e a
  // coluna 41 sumiam sem aviso, e o passo seguinte do import apaga o acervo da filial e o
  // recria a partir do plano. Ativo que deixa de existir sem sinal. Agora recusa.
  //
  // F56 · Frente C — a checagem de linhas/colunas SAIU de `lerXlsx` (que só faz o teto
  // PRÉ-load do `.xlsx`, Decisão 7) e foi para `conferirTetos` (`limites.ts`), chamada
  // por `analisar()` — o MESMO ponto para CSV e `.xlsx`. Por isso estes testes agora
  // exercitam `validarArquivoImport` (o caminho real), não `lerXlsx` isolado — que, por
  // si, não rejeita mais planilha grande/larga (ela só NÃO TRUNCA, o que os testes de
  // "aceita exatamente no teto" abaixo continuam provando direto no leitor).
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
    // header (1) + (MAX_LINHAS_PLANILHA + 1) linhas de dados
    const buf = await planilhaComUltimaLinha(MAX_LINHAS_PLANILHA + 2)
    await expect(validarArquivoImport(buf, FILIAL, VOCAB, HOJE)).rejects.toBeInstanceOf(ErroArquivoImport)
    await expect(validarArquivoImport(buf, FILIAL, VOCAB, HOJE)).rejects.toThrow(
      `${(MAX_LINHAS_PLANILHA + 1).toLocaleString('pt-BR')} linhas`,
    )
    await expect(validarArquivoImport(buf, FILIAL, VOCAB, HOJE)).rejects.toThrow(
      `o limite do import é ${MAX_LINHAS_PLANILHA.toLocaleString('pt-BR')}`,
    )
  })

  it('aceita a planilha EXATAMENTE no teto de linhas (o limite não é off-by-one) — lerXlsx não trunca', async () => {
    const buf = await planilhaComUltimaLinha(MAX_LINHAS_PLANILHA + 1)
    const csv = await lerXlsx(buf)
    expect(csv.linhas).toHaveLength(MAX_LINHAS_PLANILHA)
    // e a ÚLTIMA linha continua chegando ao motor — é o que o truncamento comia
    expect(csv.linhas.at(-1)!.linha).toBe(MAX_LINHAS_PLANILHA + 1)
    expect(csv.linhas.at(-1)!.celulas[0]).toBe('WAP0001234')
    // e `validarArquivoImport` (que roda `conferirTetos`) aceita — não rejeita.
    await expect(validarArquivoImport(buf, FILIAL, VOCAB, HOJE)).resolves.toBeTruthy()
  })

  it('recusa planilha mais larga que o teto de colunas em vez de cortar à direita', async () => {
    const header = Array.from({ length: MAX_COLUNAS_PLANILHA + 1 }, (_, i) => `Col ${i + 1}`)
    const buf = await montarXlsx(header, [['x']])
    await expect(validarArquivoImport(buf, FILIAL, VOCAB, HOJE)).rejects.toBeInstanceOf(ErroArquivoImport)
    await expect(validarArquivoImport(buf, FILIAL, VOCAB, HOJE)).rejects.toThrow('41 colunas')
  })

  it('aceita a planilha EXATAMENTE no teto de colunas — lerXlsx não trunca', async () => {
    const header = Array.from({ length: MAX_COLUNAS_PLANILHA }, (_, i) => `Col ${i + 1}`)
    const buf = await montarXlsx(header, [['x']])
    const csv = await lerXlsx(buf)
    expect(csv.header).toHaveLength(MAX_COLUNAS_PLANILHA)
  })
})

describe('lerXlsx — Decisão 8 (F56 · Frente C): valor à direita do cabeçalho não é truncado', () => {
  it('lerLinha entrega célula além do cabeçalho em vez de descartá-la', async () => {
    const buf = await montarXlsx(['A', 'B'], [['x', 'y', 'z']]) // 3ª célula sem coluna nomeada
    const csv = await lerXlsx(buf)
    expect(csv.header).toEqual(['A', 'B'])
    expect(csv.linhas[0]!.celulas).toEqual(['x', 'y', 'z'])
  })

  it('.xlsx com valor à direita do cabeçalho é recusado por linha_desalinhada (via validarArquivoImport)', async () => {
    const linhasXlsxComSobra: unknown[][] = [
      [
        'Matriz', 'Dell', 'Notebook', 'Latitude 5490', 'WAP', 'ST-1', 'WAP0001234',
        '16GB', '512GB', 'i5', 'NB-1', dataUTC(2026, 3, 10),
        'Estoque', 'Guardada', dataUTC(2026, 2, 1), '', '', 'ok', 'VALOR SOBRANDO',
      ],
    ]
    const buf = await montarXlsx(HEADER_MATRIZ, linhasXlsxComSobra)
    const v = await validarArquivoImport(buf, FILIAL, VOCAB, HOJE)
    expect(v.plano).toBeNull()
    expect(v.bloqueantes.some((e) => e.tipo === 'linha_desalinhada')).toBe(true)
  })
})

describe('lerXlsx — Decisão 7 (F56 · Frente C): teto do XML descomprimido, ANTES do load', () => {
  // "Bomba disfarçada" no molde da medição C2 (docs/f56-evidencias/C4-xlsx-antes-do-load.txt):
  // dimensão PEQUENA/legítima (1 linha, 1 coluna — passaria qualquer teto de
  // linhas/colunas por maior que fosse a bomba), mas o CONTEÚDO da célula é
  // massivamente repetitivo. O DEFLATE comprime isso a quase nada; descomprimido,
  // estoura MAX_XML_DESCOMPRIMIDO (32 MiB) — sem o `wb.xlsx.load` nunca rodar. A
  // PRÓPRIA REJEIÇÃO (`lerXlsx`) fica na casa dos milissegundos (prova de
  // correção); quem é lento aqui é só MONTAR a fixture (`writeBuffer` gerando e
  // comprimindo 35M caracteres) — daí o timeout maior, para não ficar flácido sob
  // contenção de CPU quando a suíte inteira roda em paralelo. A medição de
  // tempo/RSS "de verdade" da REJEIÇÃO está em
  // `docs/f56-evidencias/C4-xlsx-antes-do-load.txt`, via
  // `scripts/perf/xlsx-pre-load.mts`, em processo filho com teto de heap.
  it('recusa .xlsx cuja célula descomprime além do teto, ANTES de qualquer wb.xlsx.load', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Bomba')
    // 35.000.000 caracteres repetidos — comprime a poucos KB (DEFLATE é ~1.000:1
    // em conteúdo assim), descomprime acima de 32 MiB.
    ws.getCell('A1').value = 'a'.repeat(35_000_000)
    const buf = new Uint8Array(
      (await wb.xlsx.writeBuffer({
        zip: { compression: 'DEFLATE', compressionOptions: { level: 9 } },
        useStyles: false,
      } as never)) as ArrayBuffer,
    )
    // A bomba comprimida é minúscula perto do conteúdo real — prova que o
    // arquivo em si passaria despercebido por um teto de TAMANHO DE ARQUIVO.
    expect(buf.byteLength).toBeLessThan(100_000)
    await expect(lerXlsx(buf)).rejects.toBeInstanceOf(ErroArquivoImport)
    await expect(lerXlsx(buf)).rejects.toThrow('XML')
  }, 30_000)

  it('.xlsx legítimo (conteúdo normal) não é afetado pelo teto pré-load', async () => {
    const buf = await montarXlsx(HEADER_MATRIZ, [
      [
        'Matriz', 'Dell', 'Notebook', 'Latitude 5490', 'WAP', 'ST-1', 'WAP0001234',
        '16GB', '512GB', 'i5', 'NB-1', dataUTC(2026, 3, 10),
        'Estoque', 'Guardada', dataUTC(2026, 2, 1), '', '', 'ok',
      ],
    ])
    await expect(lerXlsx(buf)).resolves.toBeTruthy()
  })
})
