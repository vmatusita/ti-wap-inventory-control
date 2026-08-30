// Leitor de planilha .xlsx para o import de startup (OS-F7G / decisão do Johnny
// 20/07/2026). Converte o arquivo Excel para o MESMO `CsvCru { header, linhas }`
// que o PapaParse produz (parse.ts) — daí TODO o motor (detectarLayout,
// extrairRegistros, correções, dedupe, De→Para, RPC) é reaproveitado sem mudança.
//
// POR QUE .xlsx: o CSV é uma reexportação COM PERDAS do Excel. As datas viram
// `#######` (coluna estreita) ou `08/jul` (mês abreviado sem ano), e os acentos
// viram `�` (export cp1252 mal decodificado). No .xlsx a célula de data guarda o
// SERIAL real — o ExcelJS a devolve como um `Date` — e o texto é UTF-8. Assim as
// colunas de data saem daqui já em `dd/MM/aaaa` COM o ano real, e o resto do motor
// não muda (o `parseData`/`resolverDataEntrega` já aceitam `dd/MM/aaaa`).
//
// SERVER-ONLY: o ExcelJS é lib de Node (zip/zlib). Este módulo-folha é importado só
// por plano.ts (server-only); `serverExternalPackages` no next.config inclui
// 'exceljs' (mesmo tratamento de pizzip/docxtemplater). Client Component nunca o puxa.

import ExcelJS from 'exceljs'
import type { CsvCru } from './parse'
import {
  ErroArquivoImport,
  MAX_COLUNAS_PLANILHA,
  MAX_LINHAS_PLANILHA,
  msgLimiteColunas,
  msgLimiteLinhas,
} from './limites'

/** Assinatura de arquivo ZIP — todo .xlsx é um zip (`PK\x03\x04`). Serve para
 *  ROTEAR entre o leitor xlsx e o parser CSV pelo CONTEÚDO (não pela extensão):
 *  um .xlsx renomeado para .csv, ou vice-versa, cai no caminho certo. */
export function pareceXlsx(input: ArrayBuffer | Uint8Array): boolean {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input)
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}

// Os tetos contra planilha absurda (arquivo errado / forjado) vivem em `limites.ts`,
// junto do tamanho máximo do arquivo — ver `MAX_LINHAS_PLANILHA`/`MAX_COLUNAS_PLANILHA`.

function pad(n: number, largura: number): string {
  return String(n).padStart(largura, '0')
}

/** `Date` do Excel → `dd/MM/aaaa` pelos componentes UTC. A célula de data-só vem
 *  como meia-noite UTC (o ExcelJS converte o serial para um Date em UTC); usar os
 *  getters UTC evita o off-by-one que apareceria com os getters locais. */
function dataParaDdMmAaaa(d: Date): string {
  return `${pad(d.getUTCDate(), 2)}/${pad(d.getUTCMonth() + 1, 2)}/${pad(d.getUTCFullYear(), 4)}`
}

/**
 * Uma célula do ExcelJS → o texto que o CSV DEVERIA ter tido:
 *  - data (`Date`) → `dd/MM/aaaa` com o ano real;
 *  - número → texto simples, sem notação científica (`79000000`, não `7.9e+7`);
 *  - texto → aparado, espaços internos colapsados (espelha o `.trim()` do CSV);
 *  - fórmula → o RESULTADO calculado (pode ser data/número/texto);
 *  - rich text / hyperlink → o texto visível; célula de erro → vazio (não vira dado).
 */
function celulaParaTexto(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return dataParaDdMmAaaa(value)

  const tipo = typeof value
  if (tipo === 'string') return (value as string).replace(/\s+/g, ' ').trim()
  if (tipo === 'number') return Number.isFinite(value as number) ? String(value) : ''
  if (tipo === 'boolean') return value ? 'true' : 'false'

  if (tipo === 'object') {
    // `unknown` no meio: os subtipos de célula do ExcelJS (fórmula/rich text/…) não
    // se sobrepõem a Record, então o cast direto o TS recusa — aqui só lemos chaves.
    const o = value as unknown as Record<string, unknown>
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((r) => r?.text ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    }
    // fórmula (normal ou compartilhada): usa o valor calculado, recursivo.
    if ('formula' in o || 'sharedFormula' in o) {
      return celulaParaTexto((o.result as ExcelJS.CellValue) ?? '')
    }
    // hyperlink: `{ text, hyperlink }` → o texto exibido.
    if (typeof o.text === 'string') return (o.text as string).replace(/\s+/g, ' ').trim()
    if (typeof o.hyperlink === 'string') return (o.hyperlink as string).trim()
    // célula de erro (`{ error: '#N/A' }`) → vazio: erro não deve virar valor.
    if ('error' in o) return ''
  }
  return ''
}

/**
 * Lê a 1ª planilha do .xlsx e devolve o mesmo `CsvCru` do PapaParse:
 *  - `header` = linha 1;
 *  - `linhas` = a partir da linha 2, com `linha` = número FÍSICO da linha do Excel
 *    (header = 1). Preservar o número físico mantém as correções (F7B, que endereçam
 *    a linha) funcionando igual ao CSV.
 * A largura vem da linha de cabeçalho (`cellCount` = índice da última coluna com
 * valor) — `detectarLayout`/`mapaColunas` casam por NOME, então colunas vazias à
 * direita são inofensivas. Async porque `xlsx.load` é assíncrono.
 */
export async function lerXlsx(input: ArrayBuffer | Uint8Array): Promise<CsvCru> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const wb = new ExcelJS.Workbook()
  // `Parameters<…>[0]`: os tipos de Node embutidos no ExcelJS declaram `Buffer` sem o
  // genérico novo do @types/node@20 (`Buffer<ArrayBuffer>`), então casamos para o tipo
  // que a própria assinatura do `load` espera — sem `any`.
  await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0])

  const ws = wb.worksheets[0]
  if (!ws) throw new Error('A planilha do Excel está vazia (nenhuma aba encontrada).')

  // RECUSAR, nunca truncar (dívida técnica item T, fechada em 30/08/2026). O que vem
  // depois do preview é `importar_ativos_substituir` — apaga o acervo da filial e o
  // recria a partir do plano. Uma linha cortada em silêncio aqui é um ativo que deixa
  // de existir sem ninguém saber; um erro nomeado é um arquivo que volta para o dono.
  const colunas = Math.max(ws.getRow(1).cellCount, 1)
  if (colunas > MAX_COLUNAS_PLANILHA) throw new ErroArquivoImport(msgLimiteColunas(colunas))

  const linhasDeDados = Math.max(ws.rowCount - 1, 0)
  if (linhasDeDados > MAX_LINHAS_PLANILHA) {
    throw new ErroArquivoImport(msgLimiteLinhas(linhasDeDados))
  }

  const largura = colunas

  const lerLinha = (numeroLinha: number): string[] => {
    const row = ws.getRow(numeroLinha)
    const celulas: string[] = []
    for (let c = 1; c <= largura; c++) celulas.push(celulaParaTexto(row.getCell(c).value))
    return celulas
  }

  const header = lerLinha(1)
  const linhas: CsvCru['linhas'] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    linhas.push({ celulas: lerLinha(r), linha: r })
  }

  return { header, linhas }
}
