// Limites de tamanho do import de startup (OS-F7 · F56 Frente C). FONTE ÚNICA —
// era duplicado na Server Action (`src/lib/actions/importar.ts`), no wizard
// (`src/components/admin/importar/importar-wizard.tsx`) e em
// `src/lib/validators/importar.ts` (MAX_CORRECOES/MAX_CRU/MAX_PARA, migrados para
// cá na F56). Leaf puro: importável tanto no servidor quanto no cliente sem puxar
// o barrel/motor — nada de `Buffer` aqui (o cliente não o tem); a contagem de bytes
// usa `TextEncoder`, disponível nos dois lados.
//
// ⚠ CORRIGIDO NA F56 (fato 22): o comentário desta seção dizia que o teto do
// arquivo "fica ABAIXO do bodySizeLimit de 8 MB da Server Action". Isso estava
// ERRADO para produção: a Vercel corta pedido E RESPOSTA de qualquer Function em
// 4,5 MB (decimal — a doc não diz MiB), ANTES do Next sequer rodar; o
// `bodySizeLimit` do `next.config.ts` só manda no `next dev` e em hospedagem
// própria. `LIMITE_CORPO_PLATAFORMA` abaixo é essa verdade; `next.config.ts` foi
// alinhado a ela para o `next dev` se comportar como produção. Ver
// `docs/f56-evidencias/C2-conta-dos-corpos.txt` para a conta dos cinco corpos que
// atravessam esse limite (os três pedidos de `validarImport`/`aplicarImport`/
// `baixarCsvCorrigido` e as duas respostas de `validarImport`/`baixarCsvCorrigido`).

import { larguraUtil, type CsvCru } from './parse'

/**
 * Tamanho máximo do arquivo (CSV ou XLSX — F7G) aceito no import.
 *
 * DECISÃO (F56 · Frente C, Decisão 6 do PLAN-F56.md): 1 MiB. Os inventários reais
 * das 6 filiais ficam na casa de dezenas/centenas de KB (a maior planilha já
 * importada tem 1.228 linhas — bem dentro de 1 MiB de CSV). O `.xlsx` NÃO é
 * limitado por este teto do jeito que o CSV é — um `.xlsx` comprimido carrega
 * muito mais texto de célula que 1 MiB de CSV bruto —, por isso o `.xlsx` tem
 * DOIS tetos adicionais, cada um fechando uma parte da conta: `MAX_XML_DESCOMPRIMIDO`
 * (antes do `wb.xlsx.load`, contra zip-bomb) e `MAX_BYTES_CONTEUDO` (depois do
 * parse, contra planilha legítima mas gigante — vale para os dois formatos).
 */
export const TAMANHO_MAX_ARQUIVO = 1 * 1024 * 1024

/** Rótulo legível do limite acima, para as mensagens de erro ("o limite é 1 MB"). */
export const TAMANHO_MAX_ROTULO = '1 MB'

/**
 * Tetos do LEITOR de planilha (`conferirTetos`, chamado na 1ª linha de `analisar()`
 * em `plano.ts` — vale IGUAL para CSV e `.xlsx`, F56 Frente C) — redes de segurança
 * contra arquivo errado/forjado. A maior filial real tem 1.142 ativos e a maior
 * planilha já importada tem 1.228 linhas.
 *
 * Moraram só em `xlsx.ts` até 30/08/2026 (dívida técnica, item T) — o CSV não tinha
 * teto nenhum de linha/coluna/conteúdo até a F56. Desde a F56, `conferirTetos`
 * (único ponto de checagem) RECUSA (`ErroArquivoImport`) em vez de cortar, e os
 * números vivem aqui porque a mensagem de erro os cita.
 */
export const MAX_LINHAS_PLANILHA = 2_000
export const MAX_COLUNAS_PLANILHA = 40

/**
 * Teto de CONTEÚDO decodificado (F56 · Frente C, Decisão 6) — soma dos bytes UTF-8
 * de TODA célula (header + dados) já escapada para JSON, contada por
 * `Buffer.byteLength(JSON.stringify(celula), 'utf8') - 2` (os 2 bytes das aspas
 * externas do JSON não entram — só o CONTEÚDO). Fecha a conta que
 * `MAX_LINHAS_PLANILHA`/`MAX_COLUNAS_PLANILHA` sozinhos não fecham: uma célula
 * "lixo" sem `.max()` (Site/Tipo/Status/Situação/Patrimônio quando é o PRÓPRIO
 * erro — nunca vira `AtivoPlano`, então os `.max()` de `LIMITES_CAMPO_PLANO` não a
 * alcançam) poderia ter qualquer tamanho sem este teto. Vale IGUAL para CSV e
 * `.xlsx` (medição C2, `docs/f56-evidencias/C2-conta-dos-corpos.txt`): ~2,6× o
 * conteúdo da maior planilha real.
 */
export const MAX_BYTES_CONTEUDO = 768 * 1024

/**
 * Teto do XML DESCOMPRIMIDO do `.xlsx` (F56 · Frente C, Decisão 7) — conferido
 * ANTES do `wb.xlsx.load`, somando o tamanho REAL (não o declarado) de cada
 * `xl/worksheets/*.xml` e `xl/sharedStrings.xml` depois do `zlib.inflateRawSync`.
 * Sem isto, um `.xlsx` de poucos KB com célula massivamente repetitiva expande
 * ~1.000× no `wb.xlsx.load` (o teto teórico do DEFLATE) — medido: 298 KB → mais de
 * 1 GB de RSS, sem ser recusado (`docs/f56-evidencias/C4-xlsx-antes-do-load.txt`).
 *
 * 32 MiB (não os 80 MB que a medição isolada da Decisão 7 propunha): com o teto de
 * CONTEÚDO (`MAX_BYTES_CONTEUDO`, 768 KiB) já em vigor, um `.xlsx` LEGÍTIMO e
 * IMPORTÁVEL nunca passa de ~6,6 MB de XML descomprimido (a medição C2 mediu
 * 2,83 MB para um `.xlsx` no teto de conteúdo com 40 colunas compactas; dobrado
 * para o pior escape razoável de `&`/`<`/`>` dentro do XML). 32 MiB é ~5× esse
 * pior caso legítimo — folga generosa sem abrir mão de memória à toa numa function
 * da Vercel. Continua MUITO acima da bomba: qualquer `.xlsx` disfarçado (dimensão
 * pequena, conteúdo repetitivo) estoura este teto em milissegundos, com RSS baixo.
 */
export const MAX_XML_DESCOMPRIMIDO = 32 * 1024 * 1024

/** Teto de operações de correção por import (F56 · Frente C — migrado de
 *  `validators/importar.ts`, onde valia 20.000: rede contra payload absurdo
 *  forjado fora da tela, não contra uso real — o maior import real teve 152
 *  correções). 500 = 3,3× esse máximo real; folga generosa sobre o corpo 3 (o
 *  pedido de `aplicarImport`), que cabe com folga de 2,45× mesmo DOBRANDO para
 *  1.000 (medição C2). */
export const MAX_CORRECOES = 500

/**
 * Tetos de tamanho de uma correção — uma correção escreve UMA célula de planilha
 * (F56 · Frente C — migrados de `validators/importar.ts`, onde valiam 500/200).
 * `MAX_CRU` (valor CRU do CSV que a op casa, ex.: `de`/`statusDe`/`situacaoDe`) e
 * `MAX_PARA` (valor digitado por quem corrige) — 120 para os dois: 7× o maior
 * texto real de correção já visto (17 caracteres). O corpo 3 (pedido de
 * `aplicarImport`) cabe com folga mesmo com os DOIS campos no teto de 120 em TODAS
 * as correções (medição C2, `docs/f56-evidencias/C2-conta-dos-corpos.txt`).
 */
export const MAX_CRU = 120
export const MAX_PARA = 120

/**
 * `.max()` por CAMPO do `AtivoPlano` (F56 · Frente C, Decisão 6/critério 12) — a
 * MESMA constante alimenta `planoImportSchema` (`actions/importar.ts`) e a
 * checagem do MOTOR (`plano.ts`, bloqueante `valor_longo_demais`, ANTES do plano
 * existir): o preview nunca produz um plano que o aplicar recusaria. O de
 * patrimônio é 60 porque é o mesmo teto da RPC (`0132:358-366`, confira
 * `0131:157-162`) — os demais são ≥ 1,6× o maior valor real de cada coluna
 * (produção, medido por `max(length)`: patrimônio 11 · service tag 24 · marca 8 ·
 * modelo 18 · fornecedor 10 · memória 25 · armazenamento 21 · processador 28 ·
 * hostname 14 · observação 127 (p99 90) · colaborador 64 · setor 45).
 *
 * `satisfies Record<keyof AtivoPlano, number>` é a guarda: se `AtivoPlano` ganhar
 * ou perder um campo em `tipos.ts`, este objeto para de compilar até acompanhar —
 * nunca um campo novo sai sem teto por esquecimento.
 */
export const LIMITES_CAMPO_PLANO = {
  patrimonio: 60,
  patrimonioOriginal: 60,
  serviceTag: 60,
  categoria: 30,
  marca: 60,
  modelo: 120,
  fornecedor: 80,
  memoria: 40,
  armazenamento: 40,
  processador: 80,
  hostname: 60,
  observacoes: 500,
  dataEntrada: 10,
  dataAjuste: 10,
  estadoAlvo: 30,
  colaborador: 120,
  setor: 80,
  chamado: 40,
} as const satisfies Record<
  | 'patrimonio'
  | 'patrimonioOriginal'
  | 'serviceTag'
  | 'categoria'
  | 'marca'
  | 'modelo'
  | 'fornecedor'
  | 'memoria'
  | 'armazenamento'
  | 'processador'
  | 'hostname'
  | 'observacoes'
  | 'dataEntrada'
  | 'dataAjuste'
  | 'estadoAlvo'
  | 'colaborador'
  | 'setor'
  | 'chamado',
  number
>

/** `.max()` do `arquivoHash` (sha-256 hex = 64 caracteres) em `planoImportSchema` —
 *  128 dá 2× de folga sem abrir a porta para payload absurdo no lugar do hash. */
export const MAX_ARQUIVO_HASH = 128

/**
 * O teto REAL de corpo (pedido OU resposta) de uma Vercel Function — 4,5 MB,
 * DECIMAL (a doc não diz MiB; decimal é o conservador). Acima disso, a
 * PLATAFORMA devolve `413 FUNCTION_PAYLOAD_TOO_LARGE` ANTES do Next rodar — o
 * `bodySizeLimit` do `next.config.ts` (alinhado a este número) só protege o
 * PEDIDO, e só no `next dev`/hospedagem própria; a RESPOSTA nunca teve limite
 * configurável nenhum até a F56 (`ORCAMENTO_RESPOSTA_PREVIEW` abaixo).
 */
export const LIMITE_CORPO_PLATAFORMA = 4_500_000

/** Folga mínima exigida entre o PIOR CASO aceito de cada corpo e
 *  `LIMITE_CORPO_PLATAFORMA` — `limites.test.ts` prova as cinco desigualdades
 *  contra `LIMITE_CORPO_PLATAFORMA / FOLGA_MINIMA`. */
export const FOLGA_MINIMA = 1.5

/**
 * Orçamento de bytes de JSON para a RESPOSTA do preview (`ValidacaoImport`
 * inteira) — F56 · Frente C, Decisão 6 item 3. Um CSV em que TODA linha tem erro
 * faz o corpo crescer proporcional a linhas × erros × cópias do valor cru, e
 * nenhum teto de ENTRADA (linhas/colunas/conteúdo) limita isso sozinho. Quem
 * limita é `aplicarOrcamentoResposta` (`orcamento.ts`), chamado no FIM de
 * `analisar()`: acima deste orçamento, o DETALHE (erros individuais por tipo) é
 * reduzido em degraus — nunca os totais, nunca `grupos[].linhas`/`chave`, nunca
 * `candidatos`/`plano`. 2 MB dá folga de 2,25× contra `LIMITE_CORPO_PLATAFORMA`
 * mesmo no pior caso patológico medido (duplicata em toda linha, N=2.000) —
 * ver `docs/f56-evidencias/C2-conta-dos-corpos.txt`.
 */
export const ORCAMENTO_RESPOSTA_PREVIEW = 2_000_000

/**
 * Erro do leitor de arquivo do import cuja mensagem é ESCRITA PARA O OPERADOR e, por
 * isso, atravessa o `catch` da Server Action (`aplicarImport`/`analisarImport`) em vez
 * de virar o genérico "não foi possível ler o arquivo". Qualquer outra exceção (zip
 * corrompido, erro interno do ExcelJS) continua caindo no genérico — a distinção é a
 * razão de a classe existir.
 */
export class ErroArquivoImport extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroArquivoImport'
  }
}

/** Formata milhar em pt-BR (`20.000`) para as mensagens de limite. */
function milhar(n: number): string {
  return n.toLocaleString('pt-BR')
}

/** Bytes UTF-8 de uma string — `TextEncoder`, não `Buffer` (este módulo é
 *  importado pelo cliente; o navegador não tem `Buffer`). */
function bytesUtf8(s: string): number {
  return new TextEncoder().encode(s).length
}

/** Bytes que uma célula ocupa DEPOIS de escapada para JSON (o que efetivamente
 *  atravessa a rede na resposta do preview) — a régua de `MAX_BYTES_CONTEUDO`. Os
 *  2 bytes das aspas externas do JSON não contam: só o conteúdo. */
function bytesConteudoCelula(celula: string): number {
  return bytesUtf8(JSON.stringify(celula)) - 2
}

/** Mensagem única do estouro de linhas — o teste e o leitor leem daqui. */
export function msgLimiteLinhas(linhasDoArquivo: number): string {
  return (
    `A planilha tem ${milhar(linhasDoArquivo)} linhas de dados e o limite do import é ` +
    `${milhar(MAX_LINHAS_PLANILHA)}. Divida o arquivo por filial ou remova as linhas ` +
    `sobrando e envie de novo.`
  )
}

/** Mensagem única do estouro de colunas. */
export function msgLimiteColunas(colunasDoArquivo: number): string {
  return (
    `A planilha tem ${milhar(colunasDoArquivo)} colunas e o limite do import é ` +
    `${milhar(MAX_COLUNAS_PLANILHA)}. Remova as colunas sobrando à direita e envie de novo.`
  )
}

/** Mensagem única do estouro de conteúdo decodificado (F56 · Frente C). */
export function msgLimiteConteudo(bytesAoEstourar: number): string {
  return (
    `O conteúdo das células desta planilha passa de ${milhar(Math.round(bytesAoEstourar / 1024))} KB — o ` +
    `limite do import é ${milhar(Math.round(MAX_BYTES_CONTEUDO / 1024))} KB de texto nas células. Reduza o ` +
    `texto das observações/campos livres ou divida o arquivo por filial e envie de novo.`
  )
}

/** Mensagem única do estouro de XML descomprimido do `.xlsx` (F56 · Frente C,
 *  Decisão 7) — sem o número exato: a checagem para assim que cruza o teto (nunca
 *  descomprime o resto para "saber o total certo" — é o ponto da defesa). */
export function msgXmlDescomprimido(): string {
  return (
    `O arquivo Excel expande para mais de ${milhar(Math.round(MAX_XML_DESCOMPRIMIDO / (1024 * 1024)))} MB de ` +
    `XML depois de descomprimido — bem mais do que uma planilha de inventário legítima produz. Confira se o ` +
    `arquivo não está corrompido ou foi construído de forma incomum (célula com conteúdo repetitivo demais), e ` +
    `envie de novo.`
  )
}

/** Primeiros 60 caracteres de um valor + "…" — SÓ exibição (mensagem/valor do
 *  `ErroImport`), nunca o dado que vai para o plano. */
export function abreviar60(valor: string): string {
  return valor.length > 60 ? `${valor.slice(0, 60)}…` : valor
}

/** Mensagem única de célula acima do teto do campo (F56 · Frente C, critério 12) —
 *  a linha é recusada ANTES de virar `AtivoPlano` (bloqueante `valor_longo_demais`,
 *  nunca truncar o valor do plano). */
export function msgValorLongoDemais(coluna: string, linha: number, tamanho: number, limite: number): string {
  return (
    `A coluna "${coluna}" na linha ${linha} tem ${milhar(tamanho)} caracteres — o limite é ` +
    `${milhar(limite)}. Encurte o valor no arquivo e envie de novo (o import recusa a linha em vez ` +
    `de cortar o texto).`
  )
}

/**
 * Confere os tetos de LEITURA de uma planilha já parseada — linhas, colunas e
 * conteúdo decodificado — IGUAL para CSV e `.xlsx` (F56 · Frente C). Chamada na
 * PRIMEIRA LINHA de `analisar()` (`plano.ts`), antes de qualquer outra validação:
 * o CSV passa a ter os MESMOS tetos e mensagens que o `.xlsx` já tinha (dívida T,
 * 30/08/2026). Lança `ErroArquivoImport` — a mensagem atravessa o `catch` da
 * action até o operador.
 *
 * A contagem de colunas usa a LARGURA ÚTIL do cabeçalho (última coluna com nome +
 * 1 — `larguraUtil`, `parse.ts`), não o comprimento bruto do array: colunas vazias
 * à direita (separador sobrando) não contam contra o teto, o mesmo critério que
 * `detectarLayout` já usa para tolerar cabeçalho com `;` a mais no fim.
 */
export function conferirTetos(csv: CsvCru): void {
  const colunas = larguraUtil(csv.header)
  if (colunas > MAX_COLUNAS_PLANILHA) throw new ErroArquivoImport(msgLimiteColunas(colunas))

  const linhasDeDados = csv.linhas.length
  if (linhasDeDados > MAX_LINHAS_PLANILHA) throw new ErroArquivoImport(msgLimiteLinhas(linhasDeDados))

  let bytesConteudo = 0
  const somar = (celula: string): void => {
    if (celula === '') return
    bytesConteudo += bytesConteudoCelula(celula)
    if (bytesConteudo > MAX_BYTES_CONTEUDO) throw new ErroArquivoImport(msgLimiteConteudo(bytesConteudo))
  }
  for (const h of csv.header) somar(h)
  for (const { celulas } of csv.linhas) for (const c of celulas) somar(c)
}
