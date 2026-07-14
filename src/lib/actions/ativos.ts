'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { anotacaoSchema, editarAtivoSchema } from '@/lib/validators/ativo'

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
