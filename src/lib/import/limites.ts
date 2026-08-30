// Limites de tamanho do import de startup (OS-F7). FONTE ÚNICA — era duplicado na
// Server Action (`src/lib/actions/importar.ts`) e no wizard
// (`src/components/admin/importar/importar-wizard.tsx`). Leaf puro: importável tanto
// no servidor quanto no cliente sem puxar o barrel/motor.

/**
 * Tamanho máximo do arquivo (CSV ou XLSX — F7G) aceito no import.
 *
 * DECISÃO (W3): 5 MB. O maior inventário real das 5 filiais fica na casa de
 * dezenas/centenas de KB; 5 MB cobre folgadamente e barra upload acidental de
 * arquivo errado (um dump gigante). O .xlsx é comprimido, então 5 MB brutos já são
 * muitíssimas linhas; o leitor tem tetos próprios de linhas/colunas
 * (`src/lib/import/xlsx.ts`) contra planilha absurda.
 *
 * Fica ABAIXO do `bodySizeLimit` de 8 MB da Server Action (`next.config.ts`): o maior
 * plano real (~1.200 ativos) serializa em ~0,7 MB, então há margem larga entre os dois.
 */
export const TAMANHO_MAX_ARQUIVO = 5 * 1024 * 1024

/** Rótulo legível do limite acima, para as mensagens de erro ("o limite é 5 MB"). */
export const TAMANHO_MAX_ROTULO = '5 MB'

/**
 * Tetos do LEITOR de planilha (`src/lib/import/xlsx.ts`) — redes de segurança contra
 * arquivo errado/forjado. A maior filial real tem ~1.200 linhas e ~20 colunas.
 *
 * Moraram em `xlsx.ts` até 30/08/2026 (dívida técnica, item T): lá eles TRUNCAVAM em
 * silêncio (`Math.min`) — a linha 20.001 e a coluna 41 sumiam sem aviso, e a operação
 * seguinte apaga o acervo da filial e o recria a partir do plano. Ativo que deixa de
 * existir sem sinal. Hoje o leitor RECUSA o arquivo (`ErroArquivoImport`) em vez de
 * cortar, e os números vivem aqui porque a mensagem de erro os cita.
 */
export const MAX_LINHAS_PLANILHA = 20_000
export const MAX_COLUNAS_PLANILHA = 40

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
