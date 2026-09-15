'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin } from '@/lib/auth/acesso'
import { registrarEventoAdmin } from '@/lib/auditoria-registro'
import { registrarFalha } from '@/lib/observabilidade'
import { traduzErroBanco } from '@/lib/actions/erros'
import {
  categoriasImportaveis,
  csvCorrigidoDeArquivo,
  estadosImportaveis,
  validarArquivoImport,
  type CorrecaoImport,
  type PlanoImport,
  type ValidacaoImport,
} from '@/lib/import'
import { lerVocabularioImport } from '@/lib/queries/vocabulario-import'
import { correcoesSchema, parseCorrecoesJson } from '@/lib/validators/importar'
import {
  ErroArquivoImport,
  LIMITES_CAMPO_PLANO,
  MAX_ARQUIVO_HASH,
  MAX_LINHAS_PLANILHA,
  TAMANHO_MAX_ARQUIVO,
  TAMANHO_MAX_ROTULO,
} from '@/lib/import/limites'
import {
  custoSubstituir,
  exportarAcervoFilial,
  exportarDesvinculosFk,
  paresEmOutrasFiliais,
  type CustoSubstituir,
  type TermoMultiFilial,
} from '@/lib/queries/import-logs'
import type { Filial } from '@/lib/queries/filiais'
import { chamarRpc } from '@/lib/supabase/rpc'
import { confirmacaoImportConfere, prefixoBackupImport } from '@/lib/validators/importar'
import {
  escopoDeGestaoAtual,
  escopoDoImportLog,
  pertenceAoEscopo,
} from '@/lib/escopo/pertencimento'
import {
  avisoDaLimpeza,
  copiarEntaoRemoverTermos,
  descartarBackupNaoUsado,
  prefixoDasCopias,
  raizDoBackupEmArquivo,
} from '@/lib/storage/copiar-antes-de-remover'

// Server Actions da tela admin/importar (OS-F7 / W3). Escritas com validação Zod;
// TODO acesso ao banco/Storage/RPC pelo client autenticado do operador (a RPC
// `importar_ativos_substituir` usa auth.uid() e só concede EXECUTE ao authenticated
// — jamais service_role).
//
// ⚠ CORRIGIDO NA F52: este comentário afirmava que "o conteúdo do CSV nunca é persistido
// nem logado: só o hash viaja no plano". É FALSO desde a 0033. O plano carrega os campos
// já interpretados de cada linha, e `import_logs.correcoes` guarda os valores CRUS de
// célula ("de" e "para") de cada correção aplicada no preview — que é justamente o ponto
// da coluna: auditoria = arquivo original (hash) + correções → plano. O que NÃO é
// persistido é o ARQUIVO em si; o conteúdo das células corrigidas, sim.
//
// F21 — as QUATRO actions deste módulo exigem ADMIN, não só sessão. O import de startup
// é a operação mais destrutiva do sistema (DELETE do acervo inteiro de uma filial) e a
// ADR-002 §3 o reserva ao Admin — sem vínculo de filial no meio: admin escreve em todas.
// A trava dura mora na RPC (guarda `e_admin()` interna, migration 0064, obrigatória
// porque ela é SECURITY DEFINER e passa por fora das policies); as guardas daqui são a
// recusa amigável e cobrem também o que a RPC não vê: o preview, o CSV corrigido e a
// signed URL do backup (`urlBackup` lê `import_logs`, cuja LEITURA a 0063 já restringiu
// a `e_admin()` — a guarda evita a negativa crua da RLS).
//
// F7B (17/07/2026): as três actions passam a receber as CORREÇÕES da tela (schema
// em `@/lib/validators/importar`). Elas alimentam o motor no preview e viram
// trilha de auditoria no aplicar (`import_logs.correcoes`) — o arquivo enviado
// continua imutável e o `arquivoHash` continua sendo o do arquivo ORIGINAL.
//
// F56 · Frente D (segunda metade, Decisão 3 do PLAN-F56.md) — o vocabulário do
// import (unidades/categoria/situação/prefixos) saiu do código: `validarImport` e
// `baixarCsvCorrigido` (as DUAS actions que rodam o motor) leem o vocabulário do
// BANCO A CADA CHAMADA (`lerVocabularioImport`), nunca de um campo do `FormData` —
// o cliente NUNCA envia vocabulário nenhum, e um vocabulário forjado no pedido não
// mudaria nada porque `lerPedidoFormData` (abaixo) só lê `arquivo`/`filialId`/
// `correcoes` (prova: `src/lib/actions/importar.test.ts`). `aplicarImport` NÃO roda
// o motor — o plano já chega PRONTO do preview —, mas lê o vocabulário que ELA
// leu (nunca o do cliente) para recusar um plano com `categoria`/`estadoAlvo` fora
// dos valores importáveis (critério 6).

// Limite de tamanho do arquivo: `TAMANHO_MAX_ARQUIVO` (fonte única em
// `@/lib/import/limites`, compartilhada com o wizard).

/**
 * Os SQLSTATE em que a RPC do import RECUSOU — isto é, em que se sabe que ela **não**
 * commitou. Só eles autorizam descartar o backup que subiu antes dela.
 *
 * ⚠ A LISTA É FECHADA DE PROPÓSITO, e a régua é **"sei que não commitou"**, não "deu
 * erro": a RPC do import não tem `exception` nem `savepoint` internos (nenhum
 * `begin…exception when…` no corpo das três funções, `0131`/`0132`/`0140`), então TODO
 * SQLSTATE que o Postgres devolve para quem a chamou significa transação ABORTADA —
 * não há como um `raise` no meio ter sido "pego" e a transação seguir viva:
 *   · `P0001` — os `raise exception` da própria RPC (confirmação, contagens, guardas);
 *   · `22023` — parâmetro inválido, a família que as guardas de backup/confirmação usam;
 *   · `42501` — recusa de permissão (`e_admin()`/`pode_escrever_filial()` por dentro);
 *   · `57014` — `statement_timeout`: o servidor abortou a transação, então nada entrou;
 *   · F56 · Frente F (0140, Decisão 10) — os quatro SQLSTATE de violação de integridade
 *     que uma transação Postgres levanta e que o conserto da FK deixou alcançáveis (uma
 *     pendência/lançamento que escapou da desvinculação, um NOT NULL, uma unicidade, um
 *     CHECK): `23502` (not_null_violation), `23503` (foreign_key_violation — o `23503`
 *     cru que o fato 30 mediu em produção antes desta fase), `23505`
 *     (unique_violation), `23514` (check_violation);
 *   · F56 · Frente F — as duas abortagens de CONCORRÊNCIA, que o Postgres também aborta
 *     a transação para resolver: `40001` (serialization_failure) e `40P01`
 *     (deadlock_detected) — o `pg_advisory_xact_lock` serializa import×import da mesma
 *     filial, mas não import×outra transação que dispute a mesma linha por outro caminho.
 *
 * Erro de REDE ou de gateway (504 do edge, conexão derrubada) chega aqui **sem código**
 * ou com código de outra família — e nesses a RPC pode ter commitado do outro lado.
 * Na dúvida o backup FICA: um órfão a mais no bucket custa a 12ª checagem contá-lo;
 * um backup descartado por engano custa a única cópia do que sumiu.
 */
const RECUSAS_DA_RPC = new Set([
  'P0001',
  '22023',
  '42501',
  '57014',
  '23502',
  '23503',
  '23505',
  '23514',
  '40001',
  '40P01',
])

/**
 * A mensagem que o operador vê quando a LEITURA do arquivo falha. `ErroArquivoImport`
 * é o erro que o leitor escreve para ele — teto de linhas/colunas estourado, com o
 * número e o limite — e passa inteiro. Qualquer outra exceção (zip corrompido, falha
 * interna do ExcelJS, buffer ilegível) vira o genérico: o detalhe não ajudaria quem
 * está na tela e pode vazar interno.
 */
function mensagemDeLeitura(e: unknown): string {
  if (e instanceof ErroArquivoImport) return e.message
  return 'Não foi possível ler o arquivo. Confira o CSV/Excel e tente de novo.'
}

// ---- schemas -------------------------------------------------------------

// F56 · Frente C (Decisão 6, critério 12) — os `.max()` abaixo usam a MESMA
// constante que o MOTOR usa para recusar a célula longa demais ANTES do plano
// existir (`LIMITES_CAMPO_PLANO`, `plano.ts`/`limites.ts`, bloqueante
// `valor_longo_demais`): o preview NUNCA produz um plano que este schema (ou a
// RPC, cujo teto de patrimônio é o mesmo 60) recusaria. `.nullable()` continua
// (F7E): o Zod aplica `.max()` só quando o valor não é `null`.
const ativoPlanoSchema = z.object({
  // F7E — patrimônio OPCIONAL: null importa com pendência "sem patrimônio físico"
  // (a RPC grava a pendência quando null). Se este campo não fosse nullable, o
  // `safeParse` do aplicar recusaria o plano inteiro por causa de 1 ativo sem plaqueta.
  patrimonio: z.string().max(LIMITES_CAMPO_PLANO.patrimonio).nullable(),
  patrimonioOriginal: z.string().max(LIMITES_CAMPO_PLANO.patrimonioOriginal),
  serviceTag: z.string().max(LIMITES_CAMPO_PLANO.serviceTag).nullable(),
  categoria: z.string().max(LIMITES_CAMPO_PLANO.categoria),
  marca: z.string().max(LIMITES_CAMPO_PLANO.marca).nullable(),
  modelo: z.string().max(LIMITES_CAMPO_PLANO.modelo).nullable(),
  fornecedor: z.string().max(LIMITES_CAMPO_PLANO.fornecedor).nullable(),
  memoria: z.string().max(LIMITES_CAMPO_PLANO.memoria).nullable(),
  armazenamento: z.string().max(LIMITES_CAMPO_PLANO.armazenamento).nullable(),
  processador: z.string().max(LIMITES_CAMPO_PLANO.processador).nullable(),
  hostname: z.string().max(LIMITES_CAMPO_PLANO.hostname).nullable(),
  observacoes: z.string().max(LIMITES_CAMPO_PLANO.observacoes).nullable(),
  dataEntrada: z.string().max(LIMITES_CAMPO_PLANO.dataEntrada).nullable(),
  // F7E — data do ajuste de reconciliação (yyyy-MM-dd): entrega resolvida ??
  // dataEntrada ?? null. TEM de estar no schema: o Zod DESCARTA chaves fora do
  // shape, então sem esta linha o `dataAjuste` sairia do plano antes de chegar à RPC.
  dataAjuste: z.string().max(LIMITES_CAMPO_PLANO.dataAjuste).nullable(),
  estadoAlvo: z.string().max(LIMITES_CAMPO_PLANO.estadoAlvo),
  colaborador: z.string().max(LIMITES_CAMPO_PLANO.colaborador).nullable(),
  setor: z.string().max(LIMITES_CAMPO_PLANO.setor).nullable(),
  chamado: z.string().max(LIMITES_CAMPO_PLANO.chamado).nullable(),
})

const planoImportSchema = z.object({
  filialId: z.number().int().positive(),
  arquivoHash: z.string().min(1).max(MAX_ARQUIVO_HASH),
  totalLinhasDados: z.number().int().nonnegative().max(MAX_LINHAS_PLANILHA),
  ativos: z.array(ativoPlanoSchema).min(1).max(MAX_LINHAS_PLANILHA),
})

// F56 · Frente F (migration 0140, Decisão 9) — as QUATRO chaves novas com
// `.default(0)`: o código velho no navegador (antes desta fase) manda
// `custoPreview` sem elas, e o `.default(0)` é o que permite ao Zod aceitar esse
// payload em vez de recusar o plano inteiro por "formato inválido". O objeto
// resultante vira `p_contagens` da RPC sem tradução nenhuma (`custoPreview as
// unknown as Json`, abaixo) — é a `import_revalidar_contagens` (0140) que faz a
// parte pesada: ela confere o VIVO e recusa se ele não for 0 (nunca "não
// confira"), o mesmo `coalesce(…, 0)` do lado SQL, nunca `-1`.
const custoSchema = z.object({
  ativos: z.number().int().nonnegative(),
  movimentacoes: z.number().int().nonnegative(),
  anotacoes: z.number().int().nonnegative(),
  termos: z.number().int().nonnegative(),
  pendencias_item: z.number().int().nonnegative().default(0),
  lancamentos_movimentacao: z.number().int().nonnegative().default(0),
  lancamentos_pendencia: z.number().int().nonnegative().default(0),
  ponteiros_substituto: z.number().int().nonnegative().default(0),
})

const aplicarSchema = z.object({
  plano: planoImportSchema,
  confirmacaoTexto: z.string(),
  custoPreview: custoSchema,
  // F7B — só auditoria: o plano já vem CORRIGIDO do preview. Nada aqui altera o
  // fluxo do Substituir tudo (backup/confirmação/contagens/TOCTOU intactos).
  correcoes: correcoesSchema,
})

// Retorno da RPC (jsonb) — validado antes de confiar nos números.
const rpcRetornoSchema = z.object({
  log_id: z.string(),
  filial_id: z.number(),
  ativos_criados: z.number(),
  movs_apagadas: z.number(),
  anotacoes_apagadas: z.number(),
  termos_apagados: z.number(),
  arquivos_termos_apagados: z.array(z.string()),
  // F24 — `.default(0)` e não obrigatório, de propósito. Este safeParse roda DEPOIS do
  // DELETE+INSERT já commitado: se o app subisse antes da migration 0094, um campo
  // obrigatório transformaria um deploy fora de ordem em "Import concluído, mas a
  // resposta veio inesperada" — um falso erro pós-destrutivo, o pior momento possível
  // para assustar quem acabou de substituir o acervo de uma filial.
  conflitos_abertos: z.number().default(0),
  // F56 · Frente F (migration 0140) — o mesmo precedente do `conflitos_abertos` acima,
  // para as TRÊS chaves que `import_apagar_acervo_filial` passou a devolver
  // (`pendencias_apagadas`/`lancamentos_desvinculados`/`ponteiros_anulados`,
  // 0140:294-302) e que `importar_ativos_substituir` repassa no retorno final
  // (0140:574-586). RPC velha no ar (deploy fora de ordem, fato 33) → ausentes → 0,
  // nunca um "Import concluído, mas a resposta veio inesperada" pelo motivo errado.
  pendencias_apagadas: z.number().default(0),
  lancamentos_desvinculados: z.number().default(0),
  ponteiros_anulados: z.number().default(0),
})

// ---- tipos de retorno ----------------------------------------------------

export type ValidarImportResult =
  | {
      ok: true
      // F25 — `Pick` explícito, e não `Filial`: a F25 acrescentou `cidade` ao tipo
      // (é a cidade que assina o TERMO) e o import não tem nada com isso. Amarrar
      // o contrato do import ao tipo inteiro faria toda coluna nova de `filiais`
      // vazar para esta tela — e o import é declaradamente intocado nesta fase.
      filial: Pick<Filial, 'id' | 'slug' | 'nome'>
      validacao: ValidacaoImport
      custo: CustoSubstituir
      termosMultiFilial: TermoMultiFilial[]
    }
  | { ok: false; erro: string }

export type ResultadoImport = {
  logId: string
  ativosCriados: number
  movsApagadas: number
  anotacoesApagadas: number
  termosApagados: number
  arquivosTermosRemovidos: number
  /**
   * F54 — o que NÃO saiu limpo da limpeza dos `.docx`, em pt-BR, ou ausente quando tudo
   * correu bem. Existe porque a fase inverteu o contrato: o documento assinado cuja cópia
   * de segurança falhar NÃO é mais apagado, e o operador precisa saber que ele ficou.
   */
  avisoTermos?: string
  /** F7B — correções gravadas em `import_logs.correcoes` (= o que o histórico conta). */
  correcoesAplicadas: number
  /**
   * F24 — quantos ativos desta filial ficaram em CONFLITO ENTRE FILIAIS depois do import.
   * Vem da RPC (contado dentro da transação, pela mesma fonte que a mesa de /pendencias
   * lê), NÃO do preview: entre o preview e o apply o acervo de outra filial pode mudar,
   * e o número que a tela mostra tem de ser o que ficou no banco.
   */
  conflitosAbertos: number
  /** F56 · Frente F (0140) — pendências de item do acervo que a RPC apagou. */
  pendenciasApagadas: number
  /** F56 · Frente F (0140) — lançamentos de item que perderam o vínculo (com a
   *  movimentação OU com a pendência — soma dos dois; o saldo de itens não muda). */
  lancamentosDesvinculados: number
  /** F56 · Frente F (0140) — ativos de OUTRA filial que deixaram de apontar para um
   *  ativo substituído desta filial. */
  ponteirosAnulados: number
}

export type AplicarImportResult =
  | { ok: true; resultado: ResultadoImport; backupPath: string }
  | { ok: false; erro: string }

export type UrlBackupResult = { ok: true; url: string } | { ok: false; erro: string }

export type BaixarCsvCorrigidoResult =
  | { ok: true; nome: string; conteudo: string }
  | { ok: false; erro: string }

// ---- helpers -------------------------------------------------------------

// Guardas do arquivo enviado (extensão/vazio/tamanho) — as MESMAS em toda action
// que recebe o arquivo. Extraídas na F7B para que `baixarCsvCorrigido` não afrouxe
// nada por descuido. F7G — aceita .csv E .xlsx; o ROTEAMENTO entre os dois é por
// CONTEÚDO (assinatura ZIP) dentro do motor, então um arquivo com a extensão trocada
// ainda cai no leitor certo.
function lerArquivoImport(formData: FormData): { ok: true; arquivo: File } | { ok: false; erro: string } {
  const arquivo = formData.get('arquivo')
  if (!(arquivo instanceof File)) return { ok: false, erro: 'Envie um arquivo CSV ou Excel (.xlsx).' }
  const nome = arquivo.name.toLowerCase()
  if (!nome.endsWith('.csv') && !nome.endsWith('.xlsx')) {
    return { ok: false, erro: 'O arquivo precisa ter extensão .csv ou .xlsx.' }
  }
  if (arquivo.size === 0) return { ok: false, erro: 'O arquivo está vazio.' }
  if (arquivo.size > TAMANHO_MAX_ARQUIVO) {
    return {
      ok: false,
      erro: `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB — o limite é ${TAMANHO_MAX_ROTULO}.`,
    }
  }
  return { ok: true, arquivo }
}

function lerFilialId(formData: FormData): { ok: true; filialId: number } | { ok: false; erro: string } {
  const filialId = Number(formData.get('filialId'))
  if (!Number.isInteger(filialId) || filialId <= 0) {
    return { ok: false, erro: 'Selecione uma filial válida.' }
  }
  return { ok: true, filialId }
}

export type PedidoImportFormData =
  | { ok: true; filialId: number; arquivo: File; correcoes: CorrecaoImport[] }
  | { ok: false; erro: string }

/**
 * A ÚNICA leitura do `FormData` do wizard (F56 · Frente D, critério 6/7) — as
 * DUAS actions que recebem o arquivo (`validarImport`, `baixarCsvCorrigido`)
 * chamam esta função, e só ela. Lê exatamente TRÊS chaves: `arquivo`,
 * `filialId` e `correcoes` — nenhuma outra, nunca um campo de vocabulário
 * (que o cliente nem tem por que enviar: as duas actions leem o vocabulário do
 * BANCO a cada chamada, `lerVocabularioImport`). Async só para caber no
 * contrato de Server Action deste módulo (`'use server'` exige função async em
 * todo export de topo) — não há `await` real aqui.
 *
 * PURA quanto ao `FormData`: não fala com o banco. `src/lib/actions/
 * importar.test.ts` prova as duas metades do critério 7 — (a) um `FormData`
 * com um campo de vocabulário FORJADO a mais não muda o resultado (porque esta
 * função nunca o lê); (b) uma varredura de `src/lib/actions/importar.ts`
 * reprova se aparecer `formData.get(` de qualquer chave fora destas três.
 */
export async function lerPedidoFormData(formData: FormData): Promise<PedidoImportFormData> {
  const idRes = lerFilialId(formData)
  if (!idRes.ok) return idRes
  const arqRes = lerArquivoImport(formData)
  if (!arqRes.ok) return arqRes
  const corrRes = parseCorrecoesJson(formData.get('correcoes'))
  if (!corrRes.ok) return { ok: false, erro: corrRes.erro }
  return { ok: true, filialId: idRes.filialId, arquivo: arqRes.arquivo, correcoes: corrRes.correcoes }
}

async function filialPorId(
  client: Awaited<ReturnType<typeof createClient>>,
  id: number,
): Promise<{ id: number; slug: string; nome: string; ativo: boolean } | null> {
  const { data } = await client
    .from('filiais')
    .select('id, slug, nome, ativo')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

// Timestamp seguro para chave de objeto do Storage: ISO sem os caracteres que o
// bucket rejeita/atrapalham (`:` e `.`). Ex.: 2026-07-16T14-30-05-123Z.
function timestampArquivo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

// ---- 1) validarImport ----------------------------------------------------

// Recebe o arquivo (File) + filialId + correcoes (JSON) no FormData, valida
// tamanho/extensão, roda o motor W1 com as correções e devolve preview + custo da
// substituição. O arquivo NÃO é persistido; as correções não saem daqui.
export async function validarImport(formData: FormData): Promise<ValidarImportResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // F56 · Frente D — a ÚNICA leitura do FormData: arquivo/filialId/correcoes, nunca
  // um campo de vocabulário (critério 6/7; ver o comentário no topo do arquivo).
  const pedido = await lerPedidoFormData(formData)
  if (!pedido.ok) return pedido

  const filial = await filialPorId(client, pedido.filialId)
  if (!filial) return { ok: false, erro: 'Filial não encontrada.' }
  if (!filial.ativo) return { ok: false, erro: 'Filial inativa: import bloqueado.' }

  // F56 · Frente D — o vocabulário do import (unidades/categoria/situação/prefixos)
  // vem do BANCO, lido A CADA CHAMADA — nunca do cliente e nunca de um cache entre
  // chamadas: um apelido cadastrado agora mesmo em Administração › Filiais tem de
  // valer já no próximo preview.
  let vocabulario: Awaited<ReturnType<typeof lerVocabularioImport>>
  try {
    vocabulario = await lerVocabularioImport(client)
  } catch (erro) {
    registrarFalha({ escopo: 'import.vocabulario', erro, ctx: { filialId: filial.id }, operador: aut.uid })
    return { ok: false, erro: 'Não foi possível ler o vocabulário do import. Tente novamente.' }
  }

  const filialSel = { id: filial.id, slug: filial.slug, nome: filial.nome }
  let validacao: ValidacaoImport
  let buffer: ArrayBuffer
  try {
    buffer = await pedido.arquivo.arrayBuffer()
    validacao = await validarArquivoImport(buffer, filialSel, vocabulario, undefined, pedido.correcoes)
  } catch (e) {
    // Item T (30/08/2026): o leitor de planilha RECUSA arquivo acima dos tetos em vez de
    // truncar em silêncio, e a mensagem dele é escrita para o operador (diz o número e o
    // limite). Ela precisa atravessar este catch — o genérico abaixo esconderia justamente
    // a única informação acionável. Qualquer outra exceção segue no genérico.
    return { ok: false, erro: mensagemDeLeitura(e) }
  }

  // F7C → F24 — o motor é PURO (não fala com o banco), então a régua "este par já existe
  // em outra filial" só pode nascer aqui: 1ª passada dá os candidatos, o banco diz quais
  // batem, e a 2ª passada devolve o veredito (o motor continua o único juiz). Sem
  // coincidência nenhuma, a 2ª passada nem roda.
  //
  // A MECÂNICA é a mesma da F7C; o MOTIVO mudou. Antes existia para evitar que o insert
  // da RPC estourasse o índice único GLOBAL lá na frente, depois do backup e da
  // confirmação. Desde a 0091 o índice é por filial e não há colisão a evitar: a detecção
  // continua para AVISAR, porque dois cadastros do mesmo aparelho em filiais diferentes é
  // um conflito que alguém precisa resolver — na mesa de /pendencias, não aqui.
  // F7C ampliado (F7E, contrato §1.5): DUAS identidades a conferir em outra filial —
  // (1) os pares COM patrimônio (comportamento F7C original); (2) os SEM patrimônio
  // COM service tag, pela tag (índice parcial novo). O motor devolve ambos em
  // `candidatos` (patrimonio null para os sem-plaqueta). `paresEmOutrasFiliais`
  // devolve um mapa cujas chaves casam EXATAMENTE com as que `plano.ts` monta na 2ª
  // passada (`chavePatrimonio(...)` para os com patrimônio; `∅::<service tag exata>`
  // para os nulos-com-tag). Sem colisão nenhuma, a 2ª passada nem roda — o motor
  // continua o único juiz.
  const patrimonios = validacao.candidatos
    .map((c) => c.patrimonio)
    .filter((p): p is string => p !== null)
  const tagsSemPatrimonio = validacao.candidatos.flatMap((c) =>
    c.patrimonio === null && c.serviceTag ? [c.serviceTag] : [],
  )
  try {
    const emOutras = await paresEmOutrasFiliais(client, filial.id, patrimonios, tagsSemPatrimonio)
    if (emOutras.size > 0) {
      validacao = await validarArquivoImport(buffer, filialSel, vocabulario, undefined, pedido.correcoes, emOutras)
    }
  } catch (erro) {
    registrarFalha({
      escopo: 'import.pares-outras-filiais',
      erro,
      ctx: {
        filialId: filial.id,
        patrimonios: patrimonios.length,
        tagsSemPatrimonio: tagsSemPatrimonio.length,
      },
      operador: aut.uid,
    })
    return {
      ok: false,
      erro: 'Não foi possível conferir os patrimônios contra as outras filiais. Tente novamente.',
    }
  }

  let custo: CustoSubstituir
  let termosMultiFilial: TermoMultiFilial[]
  try {
    const r = await custoSubstituir(client, filial.id)
    custo = r.custo
    termosMultiFilial = r.termosMultiFilial
  } catch (erro) {
    registrarFalha({
      escopo: 'import.custo-preview',
      erro,
      ctx: { filialId: filial.id },
      operador: aut.uid,
    })
    return { ok: false, erro: 'Não foi possível calcular o que será apagado. Tente novamente.' }
  }

  return {
    ok: true,
    filial: { id: filial.id, slug: filial.slug, nome: filial.nome },
    validacao,
    custo,
    termosMultiFilial,
  }
}

// ---- 2) aplicarImport ----------------------------------------------------

// Aplica o "Substituir tudo": guarda de ADMIN, confirmação pelo nome exato da
// filial, revalidação do estado (contagens preview × agora), backup ANTES da RPC e
// remoção best-effort dos .docx de termo apagados.
export async function aplicarImport(input: {
  plano: PlanoImport
  confirmacaoTexto: string
  custoPreview: CustoSubstituir
  correcoes: CorrecaoImport[]
}): Promise<AplicarImportResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = aplicarSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: 'Plano de import inválido. Gere o preview novamente.' }
  }
  const { plano, confirmacaoTexto, custoPreview, correcoes } = parsed.data

  const filial = await filialPorId(client, plano.filialId)
  if (!filial) return { ok: false, erro: 'Filial não encontrada.' }
  if (!filial.ativo) return { ok: false, erro: 'Filial inativa: import bloqueado.' }

  // F56 · Frente D (critério 6) — `aplicarImport` NÃO roda o motor (o plano já chega
  // PRONTO do preview), mas confere que TODO ativo do plano tem `categoria` e
  // `estadoAlvo` entre os valores IMPORTÁVEIS do vocabulário que ELA MESMA leu do
  // banco agora — nunca de um vocabulário que o cliente pudesse ter mandado (que
  // esta action nem lê: `aplicarSchema` só confere `z.string()`, não pertencimento).
  // Fecha "o servidor nunca julga com o vocabulário do cliente" também para quem
  // não passa pelo motor inteiro.
  let vocabulario: Awaited<ReturnType<typeof lerVocabularioImport>>
  try {
    vocabulario = await lerVocabularioImport(client)
  } catch (erro) {
    registrarFalha({ escopo: 'import.vocabulario', erro, ctx: { filialId: filial.id }, operador: aut.uid })
    return { ok: false, erro: 'Não foi possível ler o vocabulário do import. Tente novamente.' }
  }
  const categoriasValidas = new Set<string>(categoriasImportaveis(vocabulario).map((c) => c.categoria))
  const estadosValidos = new Set<string>(estadosImportaveis(vocabulario).map((e) => e.estado))
  const planoDentroDoVocabulario = plano.ativos.every(
    (a) => categoriasValidas.has(a.categoria) && estadosValidos.has(a.estadoAlvo),
  )
  if (!planoDentroDoVocabulario) {
    return { ok: false, erro: 'Plano de import inválido. Gere o preview novamente.' }
  }

  // Confirmação estilo GitHub: o texto tem de ser o nome da filial.
  //
  // F52 — a régua passou a ser `confirmacaoImportConfere` (a da casa: caixa e espaço nas
  // pontas toleradas) em vez da igualdade exata que estava aqui, e a MESMA régua roda
  // agora DENTRO da RPC. Duas razões:
  //   · a conferência não podia continuar parando aqui — quem chamasse a RPC direto, com
  //     a anon key e o próprio JWT, pulava o campo de confirmação inteiro;
  //   · `upper(btrim())` é ESTRITAMENTE mais permissiva que a igualdade exata, então
  //     nenhum import que era aceito ontem passa a ser recusado hoje. Adotar a igualdade
  //     exata no banco faria o contrário, e é o que esta fase não pode fazer.
  if (!confirmacaoImportConfere(confirmacaoTexto, filial.nome)) {
    return {
      ok: false,
      erro: `Confirmação incorreta: digite exatamente "${filial.nome}" para prosseguir.`,
    }
  }

  // Revalidação de estado: o preview pode ter ficado velho (outra aba mexeu no
  // acervo). Recompara as 4 contagens; se mudaram, aborta e pede novo preview.
  let atual: CustoSubstituir
  let termosMultiFilial: TermoMultiFilial[]
  try {
    const r = await custoSubstituir(client, filial.id)
    atual = r.custo
    termosMultiFilial = r.termosMultiFilial
  } catch (erro) {
    registrarFalha({
      escopo: 'import.custo-revalidar',
      erro,
      ctx: { filialId: filial.id },
      operador: aut.uid,
    })
    return { ok: false, erro: 'Não foi possível revalidar o estado da filial. Tente novamente.' }
  }

  // F56 · Frente F (0140, Decisão 9) — as OITO contagens: as quatro de sempre e as
  // quatro novas da FK. Espelha a revalidação que `import_revalidar_contagens` faz
  // dentro da transação (a checagem aqui é só a conveniência da mensagem cedo; a
  // guarda que vale de verdade é a da RPC, sob o advisory lock).
  const mudou =
    atual.ativos !== custoPreview.ativos ||
    atual.movimentacoes !== custoPreview.movimentacoes ||
    atual.anotacoes !== custoPreview.anotacoes ||
    atual.termos !== custoPreview.termos ||
    atual.pendencias_item !== custoPreview.pendencias_item ||
    atual.lancamentos_movimentacao !== custoPreview.lancamentos_movimentacao ||
    atual.lancamentos_pendencia !== custoPreview.lancamentos_pendencia ||
    atual.ponteiros_substituto !== custoPreview.ponteiros_substituto
  if (mudou) {
    return {
      ok: false,
      erro: 'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.',
    }
  }

  if (termosMultiFilial.length > 0) {
    const lista = termosMultiFilial
      .map((t) => t.colaborador ?? t.tipo)
      .slice(0, 5)
      .join(', ')
    return {
      ok: false,
      erro: `Há termo(s) que misturam esta filial com outra (${lista}${
        termosMultiFilial.length > 5 ? '…' : ''
      }). Resolva os termos antes de substituir.`,
    }
  }

  // Backup PRIMEIRO (autoproteção CLAUDE.md: destrutivo → backup antes). Falha no
  // upload aborta ANTES da RPC.
  // F52 — POR ID, e sob o prefixo que a RPC agora EXIGE (`prefixo_backup_import`).
  // Antes era `<slug>/<timestamp>.json`: um caminho que a RPC aceitava sem conferir nada
  // além de ser não-vazio, e cujo slug colide no dia em que deixar de ser único global —
  // com `upsert:false`, o segundo import falharia por causa do primeiro.
  const backupPath = `${prefixoBackupImport(filial.id)}${timestampArquivo()}.json`
  try {
    const acervo = await exportarAcervoFilial(client, filial.id)
    // F56 · Frente F (migration 0140, Decisão 9) — a mesma leitura PRÉ-RPC de
    // `exportarAcervoFilial` acima, para as três classes novas que o conserto da FK
    // vai apagar/desvincular/anular. Lida ANTES da RPC de propósito: depois dela os
    // elos já estariam nulos, e a pré-imagem seria irrecuperável.
    const desvinculos = await exportarDesvinculosFk(client, filial.id)
    const backup = {
      versao: 2,
      exportadoEm: new Date().toISOString(),
      filial: { id: filial.id, slug: filial.slug, nome: filial.nome },
      contagens: custoPreview,
      // F56 · Frente F — A LINHA DA F54 DEIXOU DE SER VERDADE (ela dizia que o import
      // "não apaga `pendencias_item`, e por isso o backup também não a lê" — a 0140
      // apaga, e agora o backup lê). Reconferido tabela a tabela contra o que a 0140
      // apaga/desvincula/anula: `movimentacoes`, `anotacoes`, `termos_gerados`, `ativos`
      // (as quatro de sempre, `...acervo`), `pendencias_item` (linhas inteiras),
      // `lancamentos_desvinculados` (a pré-imagem dos dois elos) e `ponteiros_perdidos`
      // (as linhas inteiras dos substitutos de outra filial) — os cinco caminhos de FK
      // do fato 27, um a um. A diferença é VAZIA: não há mais nada que este backup
      // precise levar para cobrir o que `import_apagar_acervo_filial` faz hoje.
      nao_incluido: [],
      pendencias_item: desvinculos.pendenciasItem,
      lancamentos_desvinculados: desvinculos.lancamentosDesvinculados,
      ponteiros_perdidos: desvinculos.ponteirosPerdidos,
      ...acervo,
    }
    const corpo = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const { error: upErr } = await client.storage
      .from('backups-import')
      .upload(backupPath, corpo, { contentType: 'application/json', upsert: false })
    if (upErr) {
      return { ok: false, erro: `Falha ao gravar o backup — import cancelado: ${upErr.message}` }
    }
  } catch (erro) {
    registrarFalha({
      escopo: 'import.backup-acervo',
      erro,
      ctx: { filialId: filial.id, backupPath },
      operador: aut.uid,
    })
    return { ok: false, erro: 'Falha ao gerar o backup do acervo. Import cancelado.' }
  }

  // RPC transacional (apaga o acervo + recria a partir do plano). Chamada pelo
  // client autenticado — a RPC lê auth.uid() para criado_por. Passa `p_contagens`
  // (as 4 contagens do preview/backup): a RPC as reconfere JÁ sob o advisory lock,
  // na mesma transação do DELETE, fechando a janela TOCTOU entre backup e delete
  // (mov concorrente apagada fora do backup / dois applies simultâneos).
  // `p_correcoes` (F7B) é trilha de auditoria: a RPC só grava em import_logs —
  // auditoria do import = arquivo original (hash) + correções → plano.
  //
  // F52 — a confirmação digitada viaja DENTRO de `p_plano`, e não como parâmetro novo:
  // acrescentar parâmetro (mesmo com `default`) cria uma função NOVA, porque
  // `create or replace` casa pela LISTA DE TIPOS dos argumentos. O overload quebraria
  // `seguranca_catalogo.sql`, que resolve a assinatura de 4 argumentos e exige UMA linha.
  const planoComConfirmacao = { ...plano, confirmacao: confirmacaoTexto }
  const { data, error } = await chamarRpc(client, 'importar_ativos_substituir', {
    p_plano: planoComConfirmacao,
    p_backup_path: backupPath,
    p_contagens: custoPreview,
    p_correcoes: correcoes,
  })
  if (error) {
    // F7F — diagnóstico: o erro da RPC caía no genérico cego (traduzErroBanco só
    // casava por substring da mensagem e ignorava o SQLSTATE). Agora registramos o
    // code/mensagem/detalhes ANTES de traduzir (nunca vaza para a operadora, mas
    // fica no servidor) e passamos o `error.code` para o mapa — timeout (57014),
    // índice do import (23505) e raises P0001 da RPC viram mensagem acionável.
    registrarFalha({
      escopo: 'import.rpc-substituir',
      erro: error,
      ctx: { filialId: plano.filialId },
      operador: aut.uid,
    })

    // F54 — A RPC RECUSOU: nada foi apagado, então o backup que subiu antes dela não cobre
    // exclusão nenhuma e não pode ficar no bucket. Sem isto, `backups-import` acumula
    // arquivos sob prefixo VÁLIDO que não correspondem a exclusão nenhuma — e um órfão sob
    // prefixo válido é material de replay, além de virar contagem na 12ª checagem.
    //
    // ⚠ É ESTE RAMO, E SÓ ESTE. O ramo do `safeParse` logo abaixo é o oposto: lá a RPC
    // CONCLUIU, os dados já foram substituídos, e o backup é a única cópia do que sumiu —
    // descartá-lo ali destruiria a prova. Errar de ramo aqui é o defeito mais caro que esta
    // fase poderia introduzir, e há teste que prova que o `safeParse` NÃO descarta.
    //
    // Client de SESSÃO, como todo o resto deste módulo (o cabeçalho proíbe service role).
    // A policy de DELETE do bucket `backups-import` é `e_admin()`, e quem chegou aqui já
    // passou por `exigirAdmin` — conferido na 0066, não suposto.
    //
    // ⚠⚠ E SÓ QUANDO A RPC RECUSOU DE VERDADE, não a qualquer erro. `error` do
    // supabase-js cobre também falha de REDE e de gateway (504 do edge, conexão
    // derrubada) — e nesses casos a RPC pode ter COMMITADO do outro lado. Descartar ali
    // apagaria a única cópia do que sumiu, que é exatamente o defeito que o parágrafo
    // acima diz existir para evitar. Por isso o descarte é gateado pelos SQLSTATE de
    // RECUSA (a régua "sei que não commitou" — ver o comentário de `RECUSAS_DA_RPC`
    // no topo do arquivo). Erro sem código, ou com código de outra família, NÃO
    // descarta — na dúvida, o backup fica.
    // (Achado da revisão adversarial: o gatilho era `if (error)`, sem filtrar.)
    //
    // F56 · Frente F (Decisão 10) — o EVENTO grava a chave certa para cada caso, e não
    // sempre `backup_descartado` (fato 30: antes disto, um `23503` cru — não coberto por
    // `RECUSAS_DA_RPC` — descrevia como "descartado" um backup que na verdade FICOU, e a
    // 12ª checagem (que só lê `backup_path`, `0138:257-264`) contava mais um
    // `backup_orfao`). `descartou` decide as DUAS coisas juntas: se descarta de fato, e
    // qual chave o evento grava — elas não podem divergir.
    const descartou = RECUSAS_DA_RPC.has(error.code ?? '')
    if (descartou) {
      await descartarBackupNaoUsado(client, backupPath)
    } else {
      registrarFalha({
        escopo: 'import.rpc-backup-nao-descartado',
        erro: error,
        ctx: { backupPath },
        operador: aut.uid,
      })
    }

    // A trilha do fracasso. `import_executado` só é gravado quando dá certo, então até aqui
    // um import recusado não deixava rastro NENHUM na aba Auditoria — só uma linha no log do
    // servidor, que ninguém lê. `eventos_admin.acao` não tem check constraint (medido: só PK
    // e FK), então o verbo novo entra sem migration.
    await registrarEventoAdmin({
      acao: 'import_falhou',
      autor: aut.uid,
      alvo: filial.slug,
      detalhe: {
        filial_id: filial.id,
        filial_nome: filial.nome,
        arquivo_hash: plano.arquivoHash,
        erro_codigo: error.code ?? null,
        // F56 · Frente F (Decisão 10) — `backup_descartado` SÓ quando ele saiu de fato;
        // `backup_path` (a chave que a 12ª checagem lê, `0138:257-264`) quando fica.
        ...(descartou ? { backup_descartado: backupPath } : { backup_path: backupPath }),
      },
    })

    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }

  const ret = rpcRetornoSchema.safeParse(data)
  if (!ret.success) {
    // A RPC concluiu (dados já substituídos), mas o retorno veio fora do formato.
    // Não há o que desfazer; sinaliza para o operador conferir os ativos.
    //
    // F56 · Frente F (Decisão 10, fato 30) — grava `import_executado` MESMO no formato
    // inesperado: sem isto, o backup que subiu antes da RPC (que COMMITOU — este ramo só
    // roda depois do `if (error)` acima) não aparece em `eventos_admin.detalhe->>
    // 'backup_path'` nem em `import_logs.backup_path` (a trilha que a RPC grava por
    // dentro é o caminho normal — mas se o RETORNO já veio fora do formato, mais vale um
    // registro redundante do lado de fora do que depender só do que a RPC gravou), e a
    // 12ª checagem contaria mais um `backup_orfao` do que sumiu sem deixar rastro.
    await registrarEventoAdmin({
      acao: 'import_executado',
      autor: aut.uid,
      alvo: filial.slug,
      detalhe: {
        filial_id: filial.id,
        filial_nome: filial.nome,
        arquivo_hash: plano.arquivoHash,
        backup_path: backupPath,
        retorno_inesperado: true,
      },
    })
    return {
      ok: false,
      erro: 'Import concluído, mas a resposta veio inesperada. Confira os ativos da filial.',
    }
  }

  // COPIA os .docx dos termos apagados para o backup e SÓ ENTÃO os remove do bucket
  // `termos` — F54.
  //
  // ⚠ ISTO INVERTEU O CONTRATO. Até aqui a remoção era best-effort ("se falhar, o import
  // já valeu — órfãos no Storage são toleráveis"), e o backup que subiu antes da RPC
  // levava só as LINHAS. Restaurar devolvia `termos_gerados` apontando para .docx que não
  // existiam mais — um documento ASSINADO por uma pessoa, destruído sem cópia. Agora a
  // cópia vem antes, e o que não copiar NÃO é removido.
  //
  // ⚠ A cópia acontece DEPOIS da RPC porque a lista de arquivos vem no RETORNO dela. Não
  // dá para listá-la no JSON do backup, que subiu antes — e é por isso que o caminho das
  // cópias é DETERMINÍSTICO: `<backup_path sem .json>/termos/`, que o restaurador e a 12ª
  // checagem recalculam sem precisar de manifesto.
  //
  // O client é o de SESSÃO, o mesmo que remove — o cabeçalho deste módulo proíbe service
  // role, e as policies de Storage (0066/0069) deixam o admin de sessão copiar (`copy()`
  // exige SELECT na origem e INSERT no destino).
  const arquivos = ret.data.arquivos_termos_apagados
  const limpeza = await copiarEntaoRemoverTermos(client, {
    prefixoDestino: prefixoDasCopias(raizDoBackupEmArquivo(backupPath)),
    caminhos: arquivos,
  })
  const arquivosTermosRemovidos = limpeza.removidos.length
  const avisoTermos = avisoDaLimpeza(limpeza, arquivos.length)

  // Trilha de auditoria (F21). `import_logs` já registra o import em detalhe; esta linha
  // existe para que a aba Auditoria de /admin/usuarios conte a história administrativa
  // completa num só lugar — quem apagou o acervo de qual filial, e quando. Nada de
  // conteúdo do CSV: só a filial, as contagens, o hash do arquivo e o caminho do backup
  // (o que permite auditar sem expor nome de colaborador nem patrimônio).
  await registrarEventoAdmin({
    acao: 'import_executado',
    autor: aut.uid,
    alvo: filial.slug,
    detalhe: {
      filial_id: filial.id,
      filial_nome: filial.nome,
      log_id: ret.data.log_id,
      arquivo_hash: plano.arquivoHash,
      total_linhas: plano.totalLinhasDados,
      ativos_criados: ret.data.ativos_criados,
      movs_apagadas: ret.data.movs_apagadas,
      anotacoes_apagadas: ret.data.anotacoes_apagadas,
      termos_apagados: ret.data.termos_apagados,
      correcoes: correcoes.length,
      // F24 — quantos conflitos entre filiais este import deixou em aberto.
      conflitos_abertos: ret.data.conflitos_abertos,
      // F56 · Frente F (0140) — o que o conserto da FK apagou/desvinculou/anulou.
      pendencias_apagadas: ret.data.pendencias_apagadas,
      lancamentos_desvinculados: ret.data.lancamentos_desvinculados,
      ponteiros_anulados: ret.data.ponteiros_anulados,
      backup_path: backupPath,
    },
  })

  revalidatePath('/ativos')
  revalidatePath('/relatorios')
  revalidatePath('/pendencias')
  revalidatePath('/')
  revalidatePath('/admin/importar')

  return {
    ok: true,
    backupPath,
    resultado: {
      logId: ret.data.log_id,
      ativosCriados: ret.data.ativos_criados,
      movsApagadas: ret.data.movs_apagadas,
      anotacoesApagadas: ret.data.anotacoes_apagadas,
      termosApagados: ret.data.termos_apagados,
      arquivosTermosRemovidos,
      ...(avisoTermos ? { avisoTermos } : {}),
      correcoesAplicadas: correcoes.length,
      conflitosAbertos: ret.data.conflitos_abertos,
      pendenciasApagadas: ret.data.pendencias_apagadas,
      lancamentosDesvinculados: ret.data.lancamentos_desvinculados,
      ponteirosAnulados: ret.data.ponteiros_anulados,
    },
  }
}

// ---- 3) urlBackup --------------------------------------------------------

// Signed URL curta (60s) do backup de um import, para download no histórico/result.
export async function urlBackup(logId: string): Promise<UrlBackupResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  if (!z.string().uuid().safeParse(logId).success) {
    return { ok: false, erro: 'Import inválido.' }
  }

  const { data: log, error } = await client
    .from('import_logs')
    .select('id, backup_path')
    .eq('id', logId)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  if (!log) return { ok: false, erro: 'Import não encontrado.' }

  // A FECHADURA DE PERTENCIMENTO (F54) — hoje um NO-OP, e é o ponto de injeção da
  // F62/F69. Esta é a cadeia mais curta de download do dump alheio, e ela é pela
  // APLICAÇÃO: a URL assinada nasce aqui, com a credencial de quem já passou por
  // `exigirAdmin`, e o Storage não tem como saber que aquele admin é de outra
  // empresa. Arrumar policy de bucket NÃO fecha isto. Com uma empresa só,
  // `pertenceAoEscopo` sempre responde `true` e nada muda para ninguém — ver
  // `src/lib/escopo/pertencimento.ts` para por que ela é uma comparação de verdade
  // e não um `return true`.
  if (!pertenceAoEscopo(escopoDeGestaoAtual(), escopoDoImportLog(log))) {
    return { ok: false, erro: 'Import não encontrado.' }
  }

  const { data: signed, error: sErr } = await client.storage
    .from('backups-import')
    .createSignedUrl(log.backup_path, 60)
  if (sErr || !signed) return { ok: false, erro: 'Falha ao gerar o link do backup.' }

  return { ok: true, url: signed.signedUrl }
}

// ---- 4) baixarCsvCorrigido (F7B) -----------------------------------------

// Aplica as correções sobre o CSV enviado e devolve o TEXTO do arquivo corrigido
// (header/ordem originais, `;`, CRLF, sem as linhas removidas). É o artefato do
// que foi efetivamente importado — reimportável no futuro sem correção nenhuma.
// Mesmas guardas de admin/extensão/tamanho das demais; o arquivo original
// segue intocado e nada é persistido aqui.
export async function baixarCsvCorrigido(formData: FormData): Promise<BaixarCsvCorrigidoResult> {
  const client = await createClient()
  const aut = await exigirAdmin(client)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  // F56 · Frente D — a ÚNICA leitura do FormData (ver o comentário no topo do arquivo).
  const pedido = await lerPedidoFormData(formData)
  if (!pedido.ok) return pedido

  const filial = await filialPorId(client, pedido.filialId)
  if (!filial) return { ok: false, erro: 'Filial não encontrada.' }

  // F56 · Frente D — o vocabulário do BANCO, lido a cada chamada (nunca do cliente).
  let vocabulario: Awaited<ReturnType<typeof lerVocabularioImport>>
  try {
    vocabulario = await lerVocabularioImport(client)
  } catch (erro) {
    registrarFalha({ escopo: 'import.vocabulario', erro, ctx: { filialId: filial.id }, operador: aut.uid })
    return { ok: false, erro: 'Não foi possível ler o vocabulário do import. Tente novamente.' }
  }

  try {
    const buffer = await pedido.arquivo.arrayBuffer()
    // Sem BOM — quem baixa põe o BOM (padrão de export do projeto).
    // A filial vai junto: sem ela o motor não roda a metade "para = a filial
    // selecionada" da regra do Site e o artefato sairia com uma op que o preview
    // recusou (revisão adversarial da F7B) — o baixado tem de espelhar o preview.
    // F7G — se a entrada foi .xlsx, o artefato sai como CSV corrigido reimportável
    // (datas já normalizadas em dd/MM/aaaa).
    const conteudo = await csvCorrigidoDeArquivo(buffer, pedido.correcoes, vocabulario, filial.nome)
    return { ok: true, nome: `import-corrigido-${filial.slug}.csv`, conteudo }
  } catch (e) {
    if (e instanceof ErroArquivoImport) return { ok: false, erro: e.message }
    return { ok: false, erro: 'Não foi possível gerar o arquivo corrigido. Refaça a análise.' }
  }
}
