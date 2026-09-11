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

import { inflateRawSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import type { CsvCru } from './parse'
import { ErroArquivoImport, MAX_XML_DESCOMPRIMIDO, msgXmlDescomprimido } from './limites'

/** Assinatura de arquivo ZIP — todo .xlsx é um zip (`PK\x03\x04`). Serve para
 *  ROTEAR entre o leitor xlsx e o parser CSV pelo CONTEÚDO (não pela extensão):
 *  um .xlsx renomeado para .csv, ou vice-versa, cai no caminho certo. */
export function pareceXlsx(input: ArrayBuffer | Uint8Array): boolean {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input)
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}

// Os tetos de LINHAS/COLUNAS/CONTEÚDO (pós-parse) vivem em `limites.ts`
// (`conferirTetos`) e são conferidos por `plano.ts` (`analisar()`, 1ª linha) — o
// MESMO ponto para CSV e `.xlsx` (F56 · Frente C). O que continua só AQUI é o teto
// PRÉ-load do `.xlsx` (Decisão 7, abaixo): ele tem de rodar ANTES do
// `wb.xlsx.load`, porque é o `load` que a bomba explode.

// ---------------------------------------------------------------------------
// F56 · Frente C, Decisão 7 — o `.xlsx` é um zip, e `wb.xlsx.load` descomprime o
// arquivo INTEIRO antes de qualquer teto (de linhas/colunas/conteúdo) valer: um
// `.xlsx` de poucos KB com célula massivamente repetitiva pode expandir ~1.000×
// (o teto teórico do DEFLATE) — medido: 298 KB → mais de 1 GB de RSS em 3,6 s, SEM
// ser recusado pelos tetos pós-load de hoje, porque a DIMENSÃO declarada (3×1)
// passaria qualquer teto de linhas/colunas por maior que fosse a bomba
// (`docs/f56-evidencias/C4-xlsx-antes-do-load.txt`).
//
// A defesa: ler o DIRETÓRIO CENTRAL do zip (parser manual, sem dependência nova) e
// somar o tamanho REAL descomprimido (não o declarado — o campo `uncompressedSize`
// do zip é só metadado de conveniência, nunca conferido pelo `inflateRaw`, e um
// zip pode mentir nele) de cada `xl/worksheets/*.xml` e `xl/sharedStrings.xml`, via
// `zlib.inflateRawSync(…, { maxOutputLength })` — que RECUSA (RangeError,
// `ERR_BUFFER_TOO_LARGE`) assim que o descomprimido cruzaria o teto, sem
// materializar o resto: é o que torna a recusa rápida e barata em RSS mesmo contra
// uma bomba de centenas de MB.
//
// DE PROPÓSITO SEM checagem pela `<dimension ref="…">` da planilha (a medição C2 e
// a T2 mostram que ela pode FALTAR ou MENTIR — e formatação em linhas vazias a
// infla sem dado nenhum — o que faria este teto recusar um `.xlsx` LEGÍTIMO por
// engano); os tetos PÓS-load (`conferirTetos`, chamado de `analisar()`) continuam
// como segunda linha de defesa, sempre.

const ASSINATURA_FIM_DIRETORIO_CENTRAL = 0x06054b50
const ASSINATURA_DIRETORIO_CENTRAL = 0x02014b50
const ASSINATURA_CABECALHO_LOCAL = 0x04034b50
/** Entradas do zip cujo XML descomprimido entra na soma do teto — as duas fontes
 *  de texto de célula do `.xlsx` (uma aba OOXML é um arquivo por planilha). */
const ALVO_PLANILHA = /^xl\/worksheets\/.*\.xml$/
const ALVO_SHARED_STRINGS = 'xl/sharedStrings.xml'

type EntradaZip = {
  nome: string
  compressedSize: number
  localHeaderOffset: number
  metodoCompressao: number
}

/** Lê o Fim do Diretório Central + o Diretório Central do zip — sem dependência
 *  nova (Buffer tem os `readUInt16LE`/`readUInt32LE` que bastam). Não lê/confere
 *  ZIP64 (arquivo de até 4 GiB): nenhum `.xlsx` de import chega perto disso, e um
 *  zip fora do padrão simplesmente lança (cai no `catch` genérico da action, como
 *  qualquer outro arquivo corrompido). */
function listarDiretorioCentral(buf: Buffer): EntradaZip[] {
  const tamanhoMinimoEOCD = 22
  const janela = Math.min(buf.byteLength, tamanhoMinimoEOCD + 65535)
  const inicioVarredura = buf.byteLength - janela
  let eocd = -1
  for (let i = buf.byteLength - tamanhoMinimoEOCD; i >= inicioVarredura; i--) {
    if (buf.readUInt32LE(i) === ASSINATURA_FIM_DIRETORIO_CENTRAL) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error('Não é um arquivo .xlsx válido (fim do diretório central do zip não encontrado).')

  const nEntradas = buf.readUInt16LE(eocd + 10)
  const offsetDiretorio = buf.readUInt32LE(eocd + 16)

  const entradas: EntradaZip[] = []
  let p = offsetDiretorio
  for (let i = 0; i < nEntradas; i++) {
    if (buf.readUInt32LE(p) !== ASSINATURA_DIRETORIO_CENTRAL) {
      throw new Error(`Diretório central do zip corrompido no offset ${p}.`)
    }
    const metodoCompressao = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nomeLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localHeaderOffset = buf.readUInt32LE(p + 42)
    const nome = buf.toString('utf8', p + 46, p + 46 + nomeLen)
    entradas.push({ nome, compressedSize, localHeaderOffset, metodoCompressao })
    p += 46 + nomeLen + extraLen + commentLen
  }
  return entradas
}

/** Offset de INÍCIO dos dados comprimidos de uma entrada — lido do CABEÇALHO
 *  LOCAL dela (o nº de bytes de nome/extra do cabeçalho local pode DIVERGIR do
 *  Diretório Central; o TAMANHO comprimido, não — esse vem sempre do Diretório
 *  Central, confiável mesmo quando o cabeçalho local usa "data descriptor" (sizes
 *  zerados no local, gravados só depois dos dados): não lemos o size do local. */
function offsetDosDados(buf: Buffer, e: EntradaZip): number {
  if (buf.readUInt32LE(e.localHeaderOffset) !== ASSINATURA_CABECALHO_LOCAL) {
    throw new Error('Cabeçalho local do zip inválido.')
  }
  const nomeLen = buf.readUInt16LE(e.localHeaderOffset + 26)
  const extraLen = buf.readUInt16LE(e.localHeaderOffset + 28)
  return e.localHeaderOffset + 30 + nomeLen + extraLen
}

/**
 * Confere o tamanho REAL descomprimido do XML de célula do `.xlsx`, ANTES do
 * `wb.xlsx.load` — soma, para cada `xl/worksheets/*.xml` e `xl/sharedStrings.xml`:
 *  - método 0 (stored/sem compressão): o próprio `compressedSize` (não há o que
 *    inflar — os bytes JÁ são o conteúdo);
 *  - método 8 (deflate): `zlib.inflateRawSync` com `maxOutputLength` = o que resta
 *    do teto — recusa RÁPIDO (RangeError) assim que o total cruzaria o teto, sem
 *    nunca materializar a bomba inteira;
 *  - qualquer OUTRO método: pulada — não é bloqueio nosso; o `wb.xlsx.load` decide
 *    (aceita ou lança o erro dele, genérico) se sabe lidar com ela.
 * Não confere `data descriptor` (bit 3 do flag do cabeçalho local): o TAMANHO usado
 * aqui vem sempre do Diretório Central (sempre correto, streaming ou não) — a
 * presença/ausência de data descriptor não muda nada do que este código lê.
 */
function confirmarTamanhoDescomprimido(bytes: Uint8Array): void {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entradas = listarDiretorioCentral(buf).filter(
    (e) => ALVO_PLANILHA.test(e.nome) || e.nome === ALVO_SHARED_STRINGS,
  )
  let total = 0
  for (const e of entradas) {
    const inicioDados = offsetDosDados(buf, e)
    const dados = buf.subarray(inicioDados, inicioDados + e.compressedSize)
    let tamanho: number
    if (e.metodoCompressao === 0) {
      tamanho = dados.byteLength
    } else if (e.metodoCompressao === 8) {
      try {
        tamanho = inflateRawSync(dados, { maxOutputLength: Math.max(0, MAX_XML_DESCOMPRIMIDO - total) }).byteLength
      } catch (err) {
        if (err instanceof RangeError) throw new ErroArquivoImport(msgXmlDescomprimido())
        throw err
      }
    } else {
      continue // método incomum — deixa o ExcelJS decidir, não recusamos por conta própria
    }
    total += tamanho
    if (total > MAX_XML_DESCOMPRIMIDO) throw new ErroArquivoImport(msgXmlDescomprimido())
  }
}

// ---------------------------------------------------------------------------

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
 * A largura MÍNIMA de cada linha vem do cabeçalho (`cellCount` = índice da última
 * coluna com valor); uma linha de DADOS com mais células preenchidas que isso NÃO
 * é truncada (F56 · Frente C, Decisão 8) — `lerLinha` lê até `max(colunas do
 * cabeçalho, células da própria linha)`, preservando o valor além do cabeçalho
 * para a régua de desalinhamento (`linhasDesalinhadas`, `parse.ts`) o enxergar, em
 * vez de sumir em silêncio. `detectarLayout`/`mapaColunas` casam por NOME, então
 * colunas vazias à direita do CABEÇALHO continuam inofensivas.
 *
 * Os tetos de linhas/colunas/conteúdo (pós-parse) NÃO são conferidos aqui — são
 * responsabilidade de `conferirTetos` (`limites.ts`), chamada por `analisar()`
 * (`plano.ts`) sobre o `CsvCru` já pronto, igual para CSV e `.xlsx`. O que RODA
 * aqui é só o teto PRÉ-load (Decisão 7, `confirmarTamanhoDescomprimido` acima) —
 * ele tem de vir antes do `load`, que é o próprio ataque.
 *
 * Async porque `xlsx.load` é assíncrono.
 */
export async function lerXlsx(input: ArrayBuffer | Uint8Array): Promise<CsvCru> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  confirmarTamanhoDescomprimido(bytes)

  const wb = new ExcelJS.Workbook()
  // `Parameters<…>[0]`: os tipos de Node embutidos no ExcelJS declaram `Buffer` sem o
  // genérico novo do @types/node@20 (`Buffer<ArrayBuffer>`), então casamos para o tipo
  // que a própria assinatura do `load` espera — sem `any`.
  await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0])

  const ws = wb.worksheets[0]
  if (!ws) throw new Error('A planilha do Excel está vazia (nenhuma aba encontrada).')

  const colunasHeader = Math.max(ws.getRow(1).cellCount, 1)

  // RECUSAR, nunca truncar (dívida técnica item T, fechada em 30/08/2026). Colunas
  // vazias à direita do cabeçalho são inofensivas (`mapaColunas` casa por NOME);
  // valor ALÉM do cabeçalho não é cortado — vai para `linhasDesalinhadas` decidir.
  const lerLinha = (numeroLinha: number): string[] => {
    const row = ws.getRow(numeroLinha)
    const largura = Math.max(colunasHeader, row.cellCount)
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
