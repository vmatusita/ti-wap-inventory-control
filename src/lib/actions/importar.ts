'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco } from '@/lib/actions/erros'
import { validarCsvImport, type PlanoImport, type ValidacaoImport } from '@/lib/import'
import {
  custoSubstituir,
  exportarAcervoFilial,
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

// DECISÃO (W3): limite de 5 MB para o CSV de import. O maior inventário real das 5
// filiais fica na casa de dezenas de KB; 5 MB cobre folgadamente e barra upload
// acidental de arquivo errado (ex.: um .xlsx renomeado, um dump gigante).
const TAMANHO_MAX = 5 * 1024 * 1024

// ---- schemas -------------------------------------------------------------

const ativoPlanoSchema = z.object({
  patrimonio: z.string(),
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
}

export type AplicarImportResult =
  | { ok: true; resultado: ResultadoImport; backupPath: string }
  | { ok: false; erro: string }

export type UrlBackupResult = { ok: true; url: string } | { ok: false; erro: string }

// ---- helpers -------------------------------------------------------------

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

// Recebe o arquivo (File) + filialId no FormData, valida tamanho/extensão, roda o
// motor W1 e devolve preview + custo da substituição. O arquivo NÃO é persistido.
export async function validarImport(formData: FormData): Promise<ValidarImportResult> {
  const client = await createClient()
  const uid = await idOperador(client)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const arquivo = formData.get('arquivo')
  const filialIdRaw = formData.get('filialId')

  const filialId = Number(filialIdRaw)
  if (!Number.isInteger(filialId) || filialId <= 0) {
    return { ok: false, erro: 'Selecione uma filial válida.' }
  }
  if (!(arquivo instanceof File)) {
    return { ok: false, erro: 'Envie um arquivo CSV.' }
  }
  if (!arquivo.name.toLowerCase().endsWith('.csv')) {
    return { ok: false, erro: 'O arquivo precisa ter extensão .csv.' }
  }
  if (arquivo.size === 0) {
    return { ok: false, erro: 'O arquivo está vazio.' }
  }
  if (arquivo.size > TAMANHO_MAX) {
    return {
      ok: false,
      erro: `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB — o limite é 5 MB.`,
    }
  }

  const filial = await filialPorId(client, filialId)
  if (!filial) return { ok: false, erro: 'Filial não encontrada.' }
  if (!filial.ativo) return { ok: false, erro: 'Filial inativa: import bloqueado.' }

  let validacao: ValidacaoImport
  try {
    const buffer = await arquivo.arrayBuffer()
    validacao = validarCsvImport(buffer, {
      id: filial.id,
      slug: filial.slug,
      nome: filial.nome,
    })
  } catch {
    return { ok: false, erro: 'Não foi possível ler o CSV. Confira o arquivo e tente de novo.' }
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

// Aplica o "Substituir tudo": guarda de operador, confirmação pelo nome exato da
// filial, revalidação do estado (contagens preview × agora), backup ANTES da RPC e
// remoção best-effort dos .docx de termo apagados.
export async function aplicarImport(input: {
  plano: PlanoImport
  confirmacaoTexto: string
  custoPreview: CustoSubstituir
}): Promise<AplicarImportResult> {
  const client = await createClient()
  const uid = await idOperador(client)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const parsed = aplicarSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: 'Plano de import inválido. Gere o preview novamente.' }
  }
  const { plano, confirmacaoTexto, custoPreview } = parsed.data

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
  const { data, error } = await client.rpc('importar_ativos_substituir', {
    p_plano: plano as unknown as Json,
    p_backup_path: backupPath,
    p_contagens: custoPreview as unknown as Json,
  })
  if (error) {
    return { ok: false, erro: traduzErroBanco(error.message) }
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
    },
  }
}

// ---- 3) urlBackup --------------------------------------------------------

// Signed URL curta (60s) do backup de um import, para download no histórico/result.
export async function urlBackup(logId: string): Promise<UrlBackupResult> {
  const client = await createClient()
  const uid = await idOperador(client)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  if (!z.string().uuid().safeParse(logId).success) {
    return { ok: false, erro: 'Import inválido.' }
  }

  const { data: log, error } = await client
    .from('import_logs')
    .select('backup_path')
    .eq('id', logId)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroBanco(error.message) }
  if (!log) return { ok: false, erro: 'Import não encontrado.' }

  const { data: signed, error: sErr } = await client.storage
    .from('backups-import')
    .createSignedUrl(log.backup_path, 60)
  if (sErr || !signed) return { ok: false, erro: 'Falha ao gerar o link do backup.' }

  return { ok: true, url: signed.signedUrl }
}
