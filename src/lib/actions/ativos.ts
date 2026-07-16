'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  anotacaoSchema,
  corrigirPatrimonioSchema,
  editarAtivoSchema,
  validarCorrecaoPatrimonio,
} from '@/lib/validators/ativo'

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
  if (error) return { ok: false, erro: traduzErroBanco(error.message) }

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

  if (error) return { ok: false, erro: traduzErroBanco(error.message) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${id}`)
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
    .select('patrimonio')
    .eq('id', ativo_id)
    .maybeSingle()
  if (eLer) return { ok: false, erro: traduzErroBanco(eLer.message) }
  if (!ativo) return { ok: false, erro: 'Ativo não encontrado.' }

  const validacao = validarCorrecaoPatrimonio(ativo.patrimonio, parsed.data.patrimonio_novo)
  if (!validacao.ok) return { ok: false, erro: validacao.erro }
  // No-op: já é o mesmo patrimônio canônico — não escreve nem cria anotação.
  if (validacao.noop) return { ok: true }

  const antigo = ativo.patrimonio
  const novo = validacao.patrimonio

  const { error: eUpd } = await supabase
    .from('ativos')
    .update({ patrimonio: novo })
    .eq('id', ativo_id)
  // Violação do par único patrimônio + service tag → mensagem amigável (erros.ts).
  if (eUpd) return { ok: false, erro: traduzErroBanco(eUpd.message) }

  const { error: eNota } = await supabase.from('anotacoes').insert({
    ativo_id,
    texto: `Patrimônio corrigido de ${antigo} para ${novo}.`,
    criado_por: uid,
  })
  if (eNota) return { ok: false, erro: traduzErroBanco(eNota.message) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${ativo_id}`)
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}
