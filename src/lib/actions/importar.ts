'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin } from '@/lib/auth/acesso'
import { registrarEventoAdmin } from '@/lib/auditoria-registro'
import { traduzErroBanco } from '@/lib/actions/erros'
import {
  csvCorrigidoDeArquivo,
  validarArquivoImport,
  type CorrecaoImport,
  type PlanoImport,
  type ValidacaoImport,
} from '@/lib/import'
import { correcoesSchema, parseCorrecoesJson } from '@/lib/validators/importar'
import { TAMANHO_MAX_ARQUIVO, TAMANHO_MAX_ROTULO } from '@/lib/import/limites'
import {
  custoSubstituir,
  exportarAcervoFilial,
  paresEmOutrasFiliais,
  type CustoSubstituir,
  type TermoMultiFilial,
} from '@/lib/queries/import-logs'
import type { Filial } from '@/lib/queries/filiais'
import type { Json } from '@/lib/types/database'

// Server Actions da tela admin/importar (OS-F7 / W3). Escritas com validação Zod;
// TODO acesso ao banco/Storage/RPC pelo client autenticado do operador (a RPC
// `importar_ativos_substituir` usa auth.uid() e só concede EXECUTE ao authenticated
// — jamais service_role). O conteúdo do CSV nunca é persistido nem logado: só o
// hash viaja no plano.
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

// Limite de tamanho do arquivo: `TAMANHO_MAX_ARQUIVO` (fonte única em
// `@/lib/import/limites`, compartilhada com o wizard).

// ---- schemas -------------------------------------------------------------

const ativoPlanoSchema = z.object({
  // F7E — patrimônio OPCIONAL: null importa com pendência "sem patrimônio físico"
  // (a RPC grava a pendência quando null). Se este campo não fosse nullable, o
  // `safeParse` do aplicar recusaria o plano inteiro por causa de 1 ativo sem plaqueta.
  patrimonio: z.string().nullable(),
  patrimonioOriginal: z.string(),
  serviceTag: z.string().nullable(),
  categoria: z.string(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  fornecedor: z.string().nullable(),
  memoria: z.string().nullable(),
  armazenamento: z.string().nullable(),
  processador: z.string().nullable(),
  hostname: z.string().nullable(),
  observacoes: z.string().nullable(),
  dataEntrada: z.string().nullable(),
  // F7E — data do ajuste de reconciliação (yyyy-MM-dd): entrega resolvida ??
  // dataEntrada ?? null. TEM de estar no schema: o Zod DESCARTA chaves fora do
  // shape, então sem esta linha o `dataAjuste` sairia do plano antes de chegar à RPC.
  dataAjuste: z.string().nullable(),
  estadoAlvo: z.string(),
  colaborador: z.string().nullable(),
  setor: z.string().nullable(),
  chamado: z.string().nullable(),
})

const planoImportSchema = z.object({
  filialId: z.number().int().positive(),
  arquivoHash: z.string().min(1),
  totalLinhasDados: z.number().int().nonnegative(),
  ativos: z.array(ativoPlanoSchema).min(1),
})

const custoSchema = z.object({
  ativos: z.number().int().nonnegative(),
  movimentacoes: z.number().int().nonnegative(),
  anotacoes: z.number().int().nonnegative(),
  termos: z.number().int().nonnegative(),
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
})

// ---- tipos de retorno ----------------------------------------------------

export type ValidarImportResult =
  | {
      ok: true
      filial: Filial
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
  /** F7B — correções gravadas em `import_logs.correcoes` (= o que o histórico conta). */
  correcoesAplicadas: number
  /**
   * F24 — quantos ativos desta filial ficaram em CONFLITO ENTRE FILIAIS depois do import.
   * Vem da RPC (contado dentro da transação, pela mesma fonte que a mesa de /pendencias
   * lê), NÃO do preview: entre o preview e o apply o acervo de outra filial pode mudar,
   * e o número que a tela mostra tem de ser o que ficou no banco.
   */
  conflitosAbertos: number
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

  const idRes = lerFilialId(formData)
  if (!idRes.ok) return idRes
  const arqRes = lerArquivoImport(formData)
  if (!arqRes.ok) return arqRes

  // F7B — correções da tela (ausente = []). Estrutura/whitelist/cap/datas aqui; o
  // que depende do CSV vira `correcao_invalida` no motor.
  const corrRes = parseCorrecoesJson(formData.get('correcoes'))
  if (!corrRes.ok) return { ok: false, erro: corrRes.erro }

  const filial = await filialPorId(client, idRes.filialId)
  if (!filial) return { ok: false, erro: 'Filial não encontrada.' }
  if (!filial.ativo) return { ok: false, erro: 'Filial inativa: import bloqueado.' }

  const filialSel = { id: filial.id, slug: filial.slug, nome: filial.nome }
  let validacao: ValidacaoImport
  let buffer: ArrayBuffer
  try {
    buffer = await arqRes.arquivo.arrayBuffer()
    validacao = await validarArquivoImport(buffer, filialSel, undefined, corrRes.correcoes)
  } catch {
    return { ok: false, erro: 'Não foi possível ler o arquivo. Confira o CSV/Excel e tente de novo.' }
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
  try {
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
    const emOutras = await paresEmOutrasFiliais(client, filial.id, patrimonios, tagsSemPatrimonio)
    if (emOutras.size > 0) {
      validacao = await validarArquivoImport(buffer, filialSel, undefined, corrRes.correcoes, emOutras)
    }
  } catch {
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
  } catch {
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

  // Confirmação estilo GitHub: o texto tem de ser o nome EXATO da filial.
  if (confirmacaoTexto !== filial.nome) {
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
  } catch {
    return { ok: false, erro: 'Não foi possível revalidar o estado da filial. Tente novamente.' }
  }

  const mudou =
    atual.ativos !== custoPreview.ativos ||
    atual.movimentacoes !== custoPreview.movimentacoes ||
    atual.anotacoes !== custoPreview.anotacoes ||
    atual.termos !== custoPreview.termos
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
  const backupPath = `${filial.slug}/${timestampArquivo()}.json`
  try {
    const acervo = await exportarAcervoFilial(client, filial.id)
    const backup = {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      filial: { id: filial.id, slug: filial.slug, nome: filial.nome },
      contagens: custoPreview,
      ...acervo,
    }
    const corpo = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const { error: upErr } = await client.storage
      .from('backups-import')
      .upload(backupPath, corpo, { contentType: 'application/json', upsert: false })
    if (upErr) {
      return { ok: false, erro: `Falha ao gravar o backup — import cancelado: ${upErr.message}` }
    }
  } catch {
    return { ok: false, erro: 'Falha ao gerar o backup do acervo. Import cancelado.' }
  }

  // RPC transacional (apaga o acervo + recria a partir do plano). Chamada pelo
  // client autenticado — a RPC lê auth.uid() para criado_por. Passa `p_contagens`
  // (as 4 contagens do preview/backup): a RPC as reconfere JÁ sob o advisory lock,
  // na mesma transação do DELETE, fechando a janela TOCTOU entre backup e delete
  // (mov concorrente apagada fora do backup / dois applies simultâneos).
  // `p_correcoes` (F7B) é trilha de auditoria: a RPC só grava em import_logs —
  // auditoria do import = arquivo original (hash) + correções → plano.
  const { data, error } = await client.rpc('importar_ativos_substituir', {
    p_plano: plano as unknown as Json,
    p_backup_path: backupPath,
    p_contagens: custoPreview as unknown as Json,
    p_correcoes: correcoes as unknown as Json,
  })
  if (error) {
    // F7F — diagnóstico: o erro da RPC caía no genérico cego (traduzErroBanco só
    // casava por substring da mensagem e ignorava o SQLSTATE). Agora logamos o
    // code/mensagem/detalhes ANTES de traduzir (nunca vaza para a operadora, mas
    // fica no servidor) e passamos o `error.code` para o mapa — timeout (57014),
    // índice do import (23505) e raises P0001 da RPC viram mensagem acionável.
    console.error('[importar] aplicarImport RPC error', {
      code: error.code,
      message: error.message,
      details: error.details,
      filialId: plano.filialId,
    })
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }

  const ret = rpcRetornoSchema.safeParse(data)
  if (!ret.success) {
    // A RPC concluiu (dados já substituídos), mas o retorno veio fora do formato.
    // Não há o que desfazer; sinaliza para o operador conferir os ativos.
    return {
      ok: false,
      erro: 'Import concluído, mas a resposta veio inesperada. Confira os ativos da filial.',
    }
  }

  // Remove do bucket `termos` os .docx dos termos apagados (best-effort): se
  // falhar, o import já valeu — órfãos no Storage são toleráveis (só registra).
  let arquivosTermosRemovidos = 0
  const arquivos = ret.data.arquivos_termos_apagados
  if (arquivos.length > 0) {
    try {
      const { error: rmErr } = await client.storage.from('termos').remove(arquivos)
      if (rmErr) {
        console.error('[importar] falha ao remover termos do bucket:', rmErr.message)
      } else {
        arquivosTermosRemovidos = arquivos.length
      }
    } catch (e) {
      console.error('[importar] exceção ao remover termos do bucket:', e)
    }
  }

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
      correcoesAplicadas: correcoes.length,
      conflitosAbertos: ret.data.conflitos_abertos,
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
    .select('backup_path')
    .eq('id', logId)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  if (!log) return { ok: false, erro: 'Import não encontrado.' }

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

  const idRes = lerFilialId(formData)
  if (!idRes.ok) return idRes
  const arqRes = lerArquivoImport(formData)
  if (!arqRes.ok) return arqRes

  const corrRes = parseCorrecoesJson(formData.get('correcoes'))
  if (!corrRes.ok) return { ok: false, erro: corrRes.erro }

  const filial = await filialPorId(client, idRes.filialId)
  if (!filial) return { ok: false, erro: 'Filial não encontrada.' }

  try {
    const buffer = await arqRes.arquivo.arrayBuffer()
    // Sem BOM — quem baixa põe o BOM (padrão de export do projeto).
    // A filial vai junto: sem ela o motor não roda a metade "para = a filial
    // selecionada" da regra do Site e o artefato sairia com uma op que o preview
    // recusou (revisão adversarial da F7B) — o baixado tem de espelhar o preview.
    // F7G — se a entrada foi .xlsx, o artefato sai como CSV corrigido reimportável
    // (datas já normalizadas em dd/MM/aaaa).
    const conteudo = await csvCorrigidoDeArquivo(buffer, corrRes.correcoes, filial.nome)
    return { ok: true, nome: `import-corrigido-${filial.slug}.csv`, conteudo }
  } catch {
    return { ok: false, erro: 'Não foi possível gerar o arquivo corrigido. Refaça a análise.' }
  }
}
