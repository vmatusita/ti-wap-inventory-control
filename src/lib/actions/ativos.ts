'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { traduzErroBanco } from '@/lib/actions/erros'
import { editarAtivoSchema } from '@/lib/validators/ativo'

export type EditarAtivoResult = { ok: boolean; erro?: string }

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
}): Promise<EditarAtivoResult> {
  const parsed = editarAtivoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Faça login novamente.' }

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
