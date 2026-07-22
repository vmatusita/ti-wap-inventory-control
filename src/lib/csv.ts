import Papa from 'papaparse'

// Serializador de CSV das listas operacionais (OS-F10 · T5). Puro e testado —
// nenhum acesso a banco aqui.
//
// O alvo é o Excel em pt-BR, que é exigente:
//  - separador `;` (com `,` ele joga a linha inteira numa célula só);
//  - BOM UTF-8 no início (sem ele o Excel lê o arquivo como cp1252 e "Ativação"
//    vira "AtivaÃ§Ã£o");
//  - quebras CRLF.
// PapaParse (já na stack desde a F3 — CLAUDE.md) faz o escape de aspas/separador
// e já usa CRLF por padrão; o BOM e o `;` são nossos.

// Teto de linhas de qualquer export (decisão §2 da OS-F10). Fonte única — as
// queries de export usam como `cap` padrão.
export const CAP_EXPORT = 5000

// Tamanho do bloco de leitura. O Max Rows do PostgREST (padrão 1.000 no Supabase)
// corta requests maiores EM SILÊNCIO, então as queries de export acumulam em
// blocos — sempre avançando pelo número de linhas REALMENTE recebidas, para
// funcionar seja qual for o Max Rows configurado no projeto.
export const BLOCO_EXPORT = 1000

// Guarda de sanidade do laço de blocos: com bloco de 1.000 e cap de 5.000 bastam
// 5 voltas; 50 cobre até um Max Rows de 100 sem nunca virar laço infinito.
export const MAX_BLOCOS_EXPORT = 50

// Escrito como escape (\uFEFF) de propósito: o caractere literal é invisível
// no editor e some em qualquer copiar/colar descuidado.
export const BOM_UTF8 = '\uFEFF'

export type ValorCelula = string | number | null | undefined

export type ColunaCsv<T> = {
  titulo: string
  valor: (linha: T) => ValorCelula
}

// Injeção de fórmula (CSV injection): célula que começa com `=`, `+`, `@` ou
// tab/CR é executada como fórmula ao abrir no Excel, e o conteúdo destas listas
// vem de texto livre digitado pela operação (colaborador, observação, modelo).
// PapaParse prefixa essas células com `'` quando o padrão casa.
// O `-` do padrão pronto do PapaParse (`/^[=+\-@\t\r]/`) mutilaria número
// negativo legítimo (quantidade `-3` do ajuste de item viraria `'-3`), então o
// padrão daqui só escapa `-` quando o que vem depois NÃO é um número puro.
const PADRAO_FORMULA = /^[=+@\t\r]|^-(?![0-9]+(?:[.,][0-9]+)?$)/

// Número → texto para o Excel pt-BR: inteiro sai cru (a tabela usa tabular-nums,
// o CSV não precisa de separador de milhar) e decimal sai com vírgula, que é o
// separador decimal do locale. Hoje todas as colunas numéricas dos exports são
// inteiras — o ramo decimal existe para não virar bug silencioso amanhã.
function numeroParaTexto(n: number): string {
  if (!Number.isFinite(n)) return ''
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
}

function celula(v: ValorCelula): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'number' ? numeroParaTexto(v) : v
}

/**
 * Monta o CSV completo (cabeçalho + linhas) pronto para virar Blob.
 * Sempre devolve o cabeçalho — lista vazia gera um arquivo só com os títulos.
 */
export function gerarCsv<T>(colunas: ColunaCsv<T>[], linhas: T[]): string {
  const matriz: string[][] = [
    colunas.map((c) => c.titulo),
    ...linhas.map((l) => colunas.map((c) => celula(c.valor(l)))),
  ]

  const corpo = Papa.unparse(matriz, {
    delimiter: ';',
    newline: '\r\n',
    escapeFormulae: PADRAO_FORMULA,
  })

  // BOM + corpo + quebra final (arquivo termina em nova linha, como o Excel gera).
  return `${BOM_UTF8}${corpo}\r\n`
}

/** Nome do arquivo com a data do dia: `ativos-2026-07-22.csv`. */
export function nomeArquivoCsv(prefixo: string, dataISO: string): string {
  return `${prefixo}-${dataISO}.csv`
}
