'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exigirDev } from '@/lib/auth/acesso'
import { traduzErroBanco } from '@/lib/actions/erros'
import {
  buscarAtivosDestrutivo,
  carregarFichaDestrutiva,
  montarBackupDoReset,
  previaDoReset,
} from '@/lib/queries/dev-destrutivo'
// `import type` é permitido num módulo 'use server' — a regra da F13 proíbe EXPORTAR o que não
// é função async, não importar. O que nunca pode aparecer aqui é um `export type`.
import type { CandidatoAtivo, FichaDestrutiva, PreviaReset } from '@/lib/queries/dev-destrutivo'
import {
  apagarAtivoSchema,
  apagarItemSchema,
  apagarMovimentacaoSchema,
  forcarEstadoSchema,
  forcarSaldoSchema,
  resetarSchema,
  validarOperacaoDestrutiva,
} from '@/lib/validators/dev-destrutivo'

// Server Actions da ZONA DESTRUTIVA da /dev (F23) — apagar, resetar e forçar.
//
// ⚠ ARQUIVO 'use server': só pode EXPORTAR funções async. Nada de `export const`,
// `export type { X }` ou `export *` — o incidente F13 (um `export type {}` num módulo
// 'use server') matou TODA a escrita em produção por horas. Tipo se exporta pelo alias INLINE
// ou, como aqui, não se exporta: o diálogo infere por `ReturnType`. O guarda
// `src/lib/use-server-exports.test.ts` derruba `npm test` se alguém esquecer.
//
// ⚠ `exigirDev` AQUI NÃO É A SEGURANÇA — é a MENSAGEM em pt-BR. A trava são as RPCs
// (migrations 0082/0083/0084), que chamam `exigir_dev_para_destruir` por dentro e recusam
// mesmo um request forjado; e a guarda `guarda_acervo` (0081), que recusa qualquer caminho de
// exclusão por fora delas, inclusive o do service role.
//
// ⚠ A TRILHA NÃO É ESCRITA AQUI. Os sete eventos da fase são gravados DENTRO das RPCs, na
// mesma transação da operação — ver o cabeçalho da 0082. Duplicá-los aqui geraria linha dobrada
// na auditoria; e `registrarEventoAdmin` não serviria, porque ele engole o erro de propósito e
// uma exclusão irreversível não pode ter trilha "melhor esforço".

type DevResult<T = undefined> =
  | { ok: true; aviso?: string; dados?: T }
  | { ok: false; erro: string }

// Grupos de rota afetados por cada família — a revalidação é obrigatória (§1.6 da ordem),
// senão a tela segue mostrando o que já não existe.
const ROTAS_ACERVO = ['/', '/ativos', '/movimentacoes', '/pendencias', '/relatorios/geral']
const ROTAS_ITENS = ['/itens', '/admin/itens', '/relatorios/geral']

function revalidar(rotas: readonly string[]): void {
  for (const r of rotas) revalidatePath(r)
  revalidatePath('/dev')
  revalidatePath('/dev/destrutivo')
}

/**
 * Remove os `.docx` do bucket `termos` DEPOIS do commit da RPC.
 *
 * ⚠ Por que não é a RPC que faz isto: `storage.objects` tem o trigger
 * `protect_objects_delete` (BEFORE DELETE FOR EACH STATEMENT), que recusa TODA exclusão de
 * objeto por SQL. O caminho é a API de Storage, daqui — e com o client ADMINISTRATIVO, porque
 * assim que a LINHA de `termos_gerados` some, o predicado da policy do bucket deixa de ter
 * âncora e não vale a pena depender dele para a limpeza.
 *
 * ⚠ FALHA AQUI NÃO PODE SER SILENCIOSA. A linha já morreu; se o arquivo ficar, ele vira órfão
 * invisível. Devolve a mensagem para a action avisar na tela, e a 8ª checagem de integridade
 * da /dev (`arquivo_termo_orfao`, migration 0085) passa a contá-lo.
 */
async function limparArquivosDeTermo(caminhos: string[]): Promise<string | null> {
  if (caminhos.length === 0) return null
  try {
    const admin = createAdminClient()
    const { error } = await admin.storage.from('termos').remove(caminhos)
    if (error) throw new Error(error.message)
    return null
  } catch (err) {
    console.error('[dev-destrutivo] falha ao remover .docx do bucket termos', {
      caminhos,
      erro: err instanceof Error ? err.message : String(err),
    })
    return `O registro foi apagado, mas ${caminhos.length} arquivo(s) .docx não puderam ser removidos do armazenamento. Eles ficaram órfãos — a checagem "arquivo de termo órfão" da /dev vai contá-los, e a remoção precisa ser feita pelo painel do Supabase.`
  }
}

// ---------------------------------------------------------------------------
// 0. Leituras que a tela faz sob demanda
// ---------------------------------------------------------------------------
// Server Actions de LEITURA. Existem porque os painéis são Client Components (buscam enquanto
// a pessoa digita) e um Client Component não importa um módulo `server-only`. Cada uma repete
// `exigirDev` — as funções de `queries/dev-destrutivo.ts` também repetem, e é de propósito:
// defesa em profundidade, a mesma doutrina de `queries/dev.ts`.

export async function buscarAtivosParaDestruir(input: {
  termo: string
}): Promise<DevResult<CandidatoAtivo[]>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  try {
    return { ok: true, dados: await buscarAtivosDestrutivo(input.termo ?? '') }
  } catch (err) {
    console.error('[dev-destrutivo] falha ao buscar ativos', err)
    return { ok: false, erro: 'Não foi possível buscar agora. Tente de novo em instantes.' }
  }
}

export async function carregarFicha(input: {
  ativoId: string
}): Promise<DevResult<FichaDestrutiva | null>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  try {
    return { ok: true, dados: await carregarFichaDestrutiva(input.ativoId) }
  } catch (err) {
    console.error('[dev-destrutivo] falha ao carregar a ficha', err)
    return { ok: false, erro: 'Não foi possível carregar este ativo agora.' }
  }
}

export async function calcularPreviaReset(input: {
  bloco: 'acervo' | 'itens'
  filialId: number | null
}): Promise<DevResult<PreviaReset>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }
  try {
    return { ok: true, dados: await previaDoReset(input.bloco, input.filialId) }
  } catch (err) {
    console.error('[dev-destrutivo] falha ao calcular a prévia', err)
    return { ok: false, erro: 'Não foi possível calcular o tamanho deste reset agora.' }
  }
}

// ---------------------------------------------------------------------------
// 1. Apagar um ATIVO, com todo o rastro
// ---------------------------------------------------------------------------
export async function apagarAtivo(input: {
  ativoId: string
  confirmacao: string
  justificativa: string
}): Promise<DevResult<{ movimentacoes: number; termos: number }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apagarAtivoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { ativoId, confirmacao, justificativa } = parsed.data

  const ficha = await carregarFichaDestrutiva(ativoId)
  if (!ficha) return { ok: false, erro: 'Ativo não encontrado. Atualize a página e tente de novo.' }

  // A confirmação é conferida AQUI e DENTRO da RPC (§1.3 da ordem): aqui para dar a mensagem
  // certa, lá para que forjar o request não contorne nada.
  const recusa = validarOperacaoDestrutiva({
    confirmacao,
    esperado: ficha.ativo.rotulo,
    justificativa,
    alvo: 'este ativo',
  })
  if (recusa) return { ok: false, erro: recusa }

  if (ficha.termoDeLoteBloqueia) {
    return {
      ok: false,
      erro: 'Este ativo está num termo que também cobre outros ativos. Apagá-lo destruiria um documento que não é só dele — apague o termo primeiro, ou apague antes os outros ativos do mesmo termo.',
    }
  }

  const { data, error } = await supabase.rpc('apagar_ativo', {
    p_ativo: ativoId,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  const r = (data ?? {}) as { arquivos_termos?: string[]; movimentacoes?: number; termos?: number }
  const aviso = await limparArquivosDeTermo(r.arquivos_termos ?? [])

  revalidar(ROTAS_ACERVO)
  return {
    ok: true,
    aviso: aviso ?? undefined,
    dados: { movimentacoes: r.movimentacoes ?? 0, termos: r.termos ?? 0 },
  }
}

// ---------------------------------------------------------------------------
// 2. Apagar UMA movimentação (só a última do ativo)
// ---------------------------------------------------------------------------
export async function apagarMovimentacao(input: {
  movimentacaoId: string
  confirmacao: string
  justificativa: string
}): Promise<DevResult<{ statusRestaurado: string | null }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apagarMovimentacaoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { movimentacaoId, confirmacao, justificativa } = parsed.data

  // A justificativa é conferida aqui; a confirmação (o patrimônio do ativo) a RPC compara com
  // o que ela mesma lê — não se adianta a leitura aqui só para repetir a comparação, porque
  // entre uma e outra o dado poderia mudar. O schema já garantiu o formato.
  if (justificativa.trim().length < 10) {
    return { ok: false, erro: 'Escreva uma justificativa de pelo menos 10 caracteres.' }
  }

  const { data, error } = await supabase.rpc('apagar_movimentacao', {
    p_mov: movimentacaoId,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  const r = (data ?? {}) as { status_restaurado?: string | null }
  revalidar(ROTAS_ACERVO)
  return { ok: true, dados: { statusRestaurado: r.status_restaurado ?? null } }
}

// ---------------------------------------------------------------------------
// 3. Apagar um ITEM do catálogo, com lançamentos e saldo
// ---------------------------------------------------------------------------
export async function apagarItem(input: {
  itemId: number
  confirmacao: string
  justificativa: string
}): Promise<DevResult<{ lancamentos: number }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = apagarItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { itemId, confirmacao, justificativa } = parsed.data

  const { data, error } = await supabase.rpc('apagar_item', {
    p_item: itemId,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  const r = (data ?? {}) as { lancamentos?: number }
  revalidar(ROTAS_ITENS)
  return { ok: true, dados: { lancamentos: r.lancamentos ?? 0 } }
}

// ---------------------------------------------------------------------------
// 4. RESETAR um bloco, por filial ou global
// ---------------------------------------------------------------------------
// A SEQUÊNCIA IMPORTA e é de FALHA SEGURA:
//   1º  prévia (contagens + rótulo da confirmação, pela MESMA régua da RPC);
//   2º  BACKUP — lido e gravado no bucket privado ANTES de qualquer exclusão;
//   3º  a RPC, que recusa se o backup não existir de verdade no bucket e se as contagens
//       tiverem mudado desde a prévia;
//   4º  a limpeza dos .docx, depois do commit.
// Se o passo 2 falhar, nada foi apagado. Se o 4 falhar, o aviso diz o que ficou para trás.
export async function resetarBloco(input: {
  bloco: 'acervo' | 'itens'
  filialId: number | null
  confirmacao: string
  justificativa: string
}): Promise<DevResult<Record<string, unknown>>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = resetarSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { bloco, filialId, confirmacao, justificativa } = parsed.data

  let previa
  try {
    previa = await previaDoReset(bloco, filialId)
  } catch (err) {
    console.error('[dev-destrutivo] falha ao calcular a prévia do reset', err)
    return {
      ok: false,
      erro: 'Não foi possível conferir o tamanho deste reset agora. Nada foi apagado — tente de novo em instantes.',
    }
  }

  const recusa = validarOperacaoDestrutiva({
    confirmacao,
    esperado: previa.rotulo,
    justificativa,
    alvo: 'este reset',
  })
  if (recusa) return { ok: false, erro: recusa }

  if (bloco === 'acervo' && previa.termo_misto_bloqueia) {
    return {
      ok: false,
      erro: 'Há termo(s) de lote que misturam esta filial com outra. O reset está bloqueado até que eles sejam resolvidos — apagar só metade de um termo destruiria um documento de outra filial.',
    }
  }

  // ---- BACKUP, antes de tudo ----
  let backupPath: string
  try {
    const conteudo = await montarBackupDoReset(bloco, filialId)
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
    const escopo = filialId === null ? 'global' : `filial-${filialId}`
    backupPath = `reset/${bloco}/${escopo}/${carimbo}.json`

    const { error: erroUpload } = await supabase.storage
      .from('backups-import')
      .upload(backupPath, JSON.stringify(conteudo, null, 2), {
        contentType: 'application/json',
        upsert: false,
      })
    if (erroUpload) throw new Error(erroUpload.message)
  } catch (err) {
    console.error('[dev-destrutivo] falha ao gravar o backup do reset', err)
    return {
      ok: false,
      erro: 'Não foi possível gravar o backup. NADA foi apagado — reset sem backup é proibido.',
    }
  }

  const rpc = bloco === 'acervo' ? 'resetar_acervo' : 'resetar_itens'
  // ⚠ `p_filial as unknown as number`: `supabase gen types` declara todo parâmetro de RPC como
  // não-anulável, e aqui NULL é um valor de domínio — o alcance GLOBAL. As duas RPCs tratam
  // `p_filial is null` em cada recorte (migration 0083).
  const { data, error } = await supabase.rpc(rpc, {
    p_filial: filialId as unknown as number,
    p_confirmacao: confirmacao,
    p_justificativa: justificativa,
    p_backup_path: backupPath,
    p_contagens: previa.contagens,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  const r = (data ?? {}) as Record<string, unknown> & { arquivos_termos?: string[] }
  const aviso = bloco === 'acervo' ? await limparArquivosDeTermo(r.arquivos_termos ?? []) : null

  revalidar(bloco === 'acervo' ? ROTAS_ACERVO : ROTAS_ITENS)
  return { ok: true, aviso: aviso ?? undefined, dados: { ...r, backup_path: backupPath } }
}

// ---------------------------------------------------------------------------
// 5. FORÇAR o estado de um ativo
// ---------------------------------------------------------------------------
export async function forcarEstado(input: {
  ativoId: string
  status: string
  justificativa: string
}): Promise<DevResult<{ alterado: boolean; de: string | null; para: string | null }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = forcarEstadoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { ativoId, status, justificativa } = parsed.data

  const { data, error } = await supabase.rpc('forcar_estado_ativo', {
    p_ativo: ativoId,
    p_status: status,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  const r = (data ?? {}) as { alterado?: boolean; de?: string; para?: string }
  revalidar(ROTAS_ACERVO)
  return {
    ok: true,
    aviso: r.alterado === false ? 'O ativo já estava nesse estado — nada foi registrado.' : undefined,
    dados: { alterado: r.alterado ?? false, de: r.de ?? null, para: r.para ?? null },
  }
}

// ---------------------------------------------------------------------------
// 6. FORÇAR o saldo de um item numa filial
// ---------------------------------------------------------------------------
export async function forcarSaldo(input: {
  itemId: number
  filialId: number
  saldoAlvo: number
  justificativa: string
}): Promise<DevResult<{ alterado: boolean; de: number | null; para: number | null; delta: number | null }>> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = forcarSaldoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { itemId, filialId, saldoAlvo, justificativa } = parsed.data

  const { data, error } = await supabase.rpc('forcar_saldo_item', {
    p_item: itemId,
    p_filial: filialId,
    p_saldo_alvo: saldoAlvo,
    p_justificativa: justificativa,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  const r = (data ?? {}) as { alterado?: boolean; de?: number; para?: number; delta?: number }
  revalidar(ROTAS_ITENS)
  return {
    ok: true,
    aviso:
      r.alterado === false
        ? 'O saldo já era esse — nenhum lançamento foi criado.'
        : undefined,
    dados: {
      alterado: r.alterado ?? false,
      de: r.de ?? null,
      para: r.para ?? null,
      delta: r.delta ?? null,
    },
  }
}
