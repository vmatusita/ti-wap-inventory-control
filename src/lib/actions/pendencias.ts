'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirEscritaEm, exigirPapel } from '@/lib/auth/acesso'
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
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erro: cargo.erro }

  const { ids, desfecho, observacao } = parsed.data

  // O lote pode misturar filiais (`pendencias_item.filial_id` vem do trigger 0051, que
  // copia a da movimentação): lê as filiais alvo ANTES e exige escrita em todas —
  // resolver só a parte permitida deixaria a fila meio zerada, em silêncio, com UMA
  // justificativa cobrindo o que não foi resolvido.
  const { data: alvos, error: eFiliais } = await supabase
    .from('pendencias_item')
    .select('filial_id')
    .in('id', ids)
  if (eFiliais) return { ok: false, erro: traduzErroBanco(eFiliais.message, eFiliais.code) }

  // Nenhum alvo (ids inexistentes) não é erro — esta action é idempotente de propósito
  // e o update abaixo simplesmente não acha linha. Mas o cargo de escrita continua
  // exigido: a action é um endpoint alcançável pela rede por si só.
  const aut =
    alvos && alvos.length > 0
      ? await exigirEscritaEm(supabase, alvos.map((p) => p.filial_id))
      : cargo
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const { data, error } = await supabase
    .from('pendencias_item')
    .update({
      status: 'resolvida',
      desfecho,
      observacao: observacao ?? null,
      resolvida_em: new Date().toISOString(),
      resolvida_por: aut.uid,
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
