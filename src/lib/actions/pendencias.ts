'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { resolverPendenciaItemSchema } from '@/lib/validators/pendencia-item'

// Resolve (encerra) 1..N pendências de item numa tacada — o caminho para zerar a
// fila herdada com UMA justificativa (F18 §B2). Só toca as ABERTAS (`.eq('status',
// 'aberta')`): reenviar não "re-resolve" nem sobrescreve o desfecho de quem já foi
// resolvido (idempotente e à prova de corrida). Grava desfecho/quem/quando; a
// resolvida NÃO some da ficha (auditoria), só da fila. `resolvida_por = uid` é
// gravado pelo servidor a partir da sessão — o cliente não escolhe o autor.
export async function resolverPendenciaItem(input: {
  ids: string[]
  desfecho: string
  observacao?: string
}): Promise<ActionResult> {
  const parsed = resolverPendenciaItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const { ids, desfecho, observacao } = parsed.data

  const { data, error } = await supabase
    .from('pendencias_item')
    .update({
      status: 'resolvida',
      desfecho,
      observacao: observacao ?? null,
      resolvida_em: new Date().toISOString(),
      resolvida_por: uid,
    })
    .in('id', ids)
    .eq('status', 'aberta')
    .select('ativo_id')

  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  // A fila, o badge da sidebar e os relatórios contam as abertas; as fichas dos
  // ativos afetados mostram a pendência (agora resolvida — permanece, como rastro).
  revalidatePath('/pendencias')
  for (const ativoId of new Set((data ?? []).map((r) => r.ativo_id))) {
    revalidatePath(`/ativos/${ativoId}`)
  }
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}
