'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  anotacaoSchema,
  corrigirPatrimonioSchema,
  definirServiceTagSchema,
  editarAtivoSchema,
  validarCorrecaoPatrimonio,
} from '@/lib/validators/ativo'
import { PENDENCIA_SEM_PATRIMONIO, PENDENCIA_SEM_SERVICE_TAG } from '@/lib/dominio'

// Remove UM trecho de uma pendência `;`-joinable (comparação case-insensitive),
// preservando os demais (ex.: 'sem patrimônio físico; termo pendente' → 'termo
// pendente'). String vazia após a limpeza vira null (sem pendência). PURA.
function limparTrechoPendencia(pendencia: string | null, trecho: string): string | null {
  if (!pendencia) return pendencia
  const restantes = pendencia
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t !== '' && t.toLowerCase() !== trecho.toLowerCase())
  return restantes.length > 0 ? restantes.join('; ') : null
}

function limparPendenciaSemPatrimonio(pendencia: string | null): string | null {
  return limparTrechoPendencia(pendencia, PENDENCIA_SEM_PATRIMONIO)
}

export async function anotarAtivo(input: {
  ativo_id: string
  texto: string
}): Promise<ActionResult> {
  const parsed = anotacaoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const { error } = await supabase.from('anotacoes').insert({
    ativo_id: parsed.data.ativo_id,
    texto: parsed.data.texto,
    criado_por: uid,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  revalidatePath(`/ativos/${parsed.data.ativo_id}`)
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// Atualiza SO os campos cadastrais NAO derivados (OS-F2 3.2.4). Status,
// colaborador, setor e filial NAO entram — mudam apenas por movimentacao.
export async function atualizarDadosCadastrais(input: {
  id: string
  memoria?: string
  armazenamento?: string
  processador?: string
  hostname?: string
  observacoes?: string
  termo_assinado?: string | null
  termo_data?: string | null
}): Promise<ActionResult> {
  const parsed = editarAtivoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const { id, ...campos } = parsed.data

  const { error } = await supabase
    .from('ativos')
    .update({
      memoria: campos.memoria ?? null,
      armazenamento: campos.armazenamento ?? null,
      processador: campos.processador ?? null,
      hostname: campos.hostname ?? null,
      observacoes: campos.observacoes ?? null,
      termo_assinado: campos.termo_assinado,
      termo_data: campos.termo_data,
    })
    .eq('id', id)

  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${id}`)
  // Este update grava `termo_assinado`/`termo_data` — as MESMAS colunas que a
  // pendência 'termo pendente' (v_pendencias) e a coluna Termo do relatório leem.
  // Toda outra action que as toca (confirmarAssinaturaTermo, desfazerConfirmacao,
  // gerarTermo) revalida as duas rotas; só esta não revalidava, deixando a fila e
  // o relatório servido ao visualizador por senha divergentes da ficha.
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// corrigirPatrimonio (B7, F6B) — o patrimônio pode ser corrigido; a service tag
// é IMUTÁVEL (identidade do equipamento, nunca editável). O novo valor é sempre
// canonicalizado (WAP0004491). Rastro "de → para" na `anotacoes` (imutável,
// autor+data já na linha do tempo). Não toca `patrimonio_original` (valor da
// planilha) nem `service_tag`. Congelados (relatórios/termos gerados) guardam o
// texto da época de propósito; o relatório ao vivo reflete via join.
// ---------------------------------------------------------------------------
export async function corrigirPatrimonio(input: {
  ativo_id: string
  patrimonio_novo: string
}): Promise<ActionResult> {
  const parsed = corrigirPatrimonioSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const { ativo_id } = parsed.data

  const { data: ativo, error: eLer } = await supabase
    .from('ativos')
    .select('patrimonio, pendencia')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message, eLer.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  const validacao = validarCorrecaoPatrimonio(ativo.patrimonio, parsed.data.patrimonio_novo)
  if (!validacao.ok) return { ok: false, erro: validacao.erro }
  // No-op: já é o mesmo patrimônio canônico — não escreve nem cria anotação.
  if (validacao.noop) return { ok: true }

  const antigo = ativo.patrimonio
  const novo = validacao.patrimonio

  // F7E — ao dar patrimônio a um ativo que veio sem plaqueta, encerra o trecho
  // 'sem patrimônio físico' da pendência (preservando os demais, ex.: termo).
  const pendenciaLimpa = limparPendenciaSemPatrimonio(ativo.pendencia)
  const patch: { patrimonio: string; pendencia?: string | null } = { patrimonio: novo }
  if (pendenciaLimpa !== ativo.pendencia) patch.pendencia = pendenciaLimpa

  const { error: eUpd } = await supabase
    .from('ativos')
    .update(patch)
    .eq('id', ativo_id)
  // Violação do par único patrimônio + service tag → mensagem amigável (erros.ts).
  if (eUpd) return { ok: false, erro: traduzErroBanco(eUpd.message, eUpd.code) }

  // "de" nulo (ativo sem patrimônio) → registra "de sem patrimônio para WAP…".
  const { error: eNota } = await supabase.from('anotacoes').insert({
    ativo_id,
    texto: `Patrimônio corrigido de ${antigo ?? 'sem patrimônio'} para ${novo}.`,
    criado_por: uid,
  })
  if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message, eNota.code) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${ativo_id}`)
  // A pendência 'sem patrimônio físico' pode ter sido encerrada — atualiza a fila.
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// definirServiceTag (F15/C1) — espelho do corrigirPatrimonio, mas para a service
// tag e SÓ quando ela está VAZIA (ativo importado sem tag). Editar uma ST já
// preenchida continua PROIBIDO (imutável — identidade do equipamento): a action
// recusa. Ao definir, remove só o trecho 'sem service tag' da pendência
// (preservando os demais). Rastro "de → para" na `anotacoes` (imutável). A colisão
// do par patrimônio + service tag (§5, índice único) vira mensagem amigável (erros.ts).
// ---------------------------------------------------------------------------
export async function definirServiceTag(input: {
  ativo_id: string
  service_tag: string
}): Promise<ActionResult> {
  const parsed = definirServiceTagSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const { ativo_id, service_tag } = parsed.data

  const { data: ativo, error: eLer } = await supabase
    .from('ativos')
    .select('service_tag, pendencia')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message, eLer.code) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  // Imutabilidade: só DEFINE quando está vazia; ST já preenchida nunca muda.
  if (ativo.service_tag != null && ativo.service_tag.trim() !== '') {
    return {
      ok: false,
      erro: 'Este ativo já tem service tag — ela é imutável (identidade do equipamento).',
    }
  }

  // Encerra só o trecho 'sem service tag' da pendência (preserva os demais).
  const pendenciaLimpa = limparTrechoPendencia(ativo.pendencia, PENDENCIA_SEM_SERVICE_TAG)
  const patch: { service_tag: string; pendencia?: string | null } = { service_tag }
  if (pendenciaLimpa !== ativo.pendencia) patch.pendencia = pendenciaLimpa

  const { error: eUpd } = await supabase.from('ativos').update(patch).eq('id', ativo_id)
  // Violação do par único patrimônio + service tag → mensagem amigável (erros.ts).
  if (eUpd) return { ok: false, erro: traduzErroBanco(eUpd.message, eUpd.code) }

  const { error: eNota } = await supabase.from('anotacoes').insert({
    ativo_id,
    texto: `Service tag definida: ${service_tag}.`,
    criado_por: uid,
  })
  if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message, eNota.code) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${ativo_id}`)
  // A pendência 'sem service tag' pode ter sido encerrada — atualiza a fila.
  revalidatePath('/pendencias')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}
