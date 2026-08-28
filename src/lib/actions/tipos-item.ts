'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirAdmin } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import {
  tipoItemSchema,
  atualizarTipoItemSchema,
  tipoDoItemSchema,
  proximaOrdemDeTipo,
  MSG_TIPO_DUPLICADO,
} from '@/lib/validators/tipo-item'

// Server Actions do catálogo de TIPOS de item (F37 · D7).
//
// Regime ÚNICO de permissão: `exigirAdmin()`, como filiais/motivos/kits/itens. Tipo é
// vocabulário do sistema — o operador escolhe, não inventa. (Diferente de
// `colaboradores`, que o operador CRIA inline: pessoa nova aparece todo dia,
// vocabulário não.)
//
// A guarda dá a MENSAGEM em pt-BR; a segurança é a RLS da 0114 (`e_admin()`).

function revalidarTipos() {
  revalidatePath('/admin/tipos-item')
  revalidatePath('/admin/itens')
  revalidatePath('/itens')
}

function erroDeTipo(mensagem: string, code?: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('tipos_item_slug_key') || m.includes('duplicate key')) {
    return MSG_TIPO_DUPLICADO
  }
  if (m.includes('tipos_item_slug_formato')) {
    return 'Código inválido: use minúsculas sem acento, começando por letra (ex.: fone_bluetooth).'
  }
  if (m.includes('tipos_item_rotulo_nao_vazio')) {
    return 'Informe o nome que aparece na tela.'
  }
  return traduzErroBanco(mensagem, code)
}

export type CriarTipoResult = ActionResult & { id?: number; reativado?: boolean }

export async function criarTipoItem(input: {
  slug: string
  rotulo: string
  ordem?: number
}): Promise<CriarTipoResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = tipoItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  // Homônimo DESATIVADO: reativa em vez de recusar. Mesmo beco sem saída que a F12
  // documentou em `criarItemInline` — o admin não vê o tipo na lista de ativos,
  // tenta criar, e levaria "já existe" para algo que a tela diz não existir.
  const { data: existente, error: erroBusca } = await supabase
    .from('tipos_item')
    .select('id, ativo')
    .eq('slug', parsed.data.slug)
    .maybeSingle()
  if (erroBusca) {
    return { ok: false, erro: traduzErroBanco(erroBusca.message, erroBusca.code) }
  }
  if (existente) {
    if (existente.ativo) return { ok: false, erro: MSG_TIPO_DUPLICADO }
    const { error } = await supabase
      .from('tipos_item')
      .update({ ativo: true, rotulo: parsed.data.rotulo })
      .eq('id', existente.id)
    if (error) return { ok: false, erro: erroDeTipo(error.message, error.code) }
    revalidarTipos()
    return { ok: true, id: existente.id, reativado: true }
  }

  // Ordem: a informada, ou 10 acima da maior — para o tipo novo cair no fim da lista
  // sem que ninguém precise renumerar nada.
  let ordem = parsed.data.ordem
  if (!ordem) {
    const { data: maior } = await supabase
      .from('tipos_item')
      .select('ordem')
      .order('ordem', { ascending: false })
      .limit(1)
      .maybeSingle()
    ordem = proximaOrdemDeTipo(maior?.ordem ?? null)
  }

  const { data, error } = await supabase
    .from('tipos_item')
    .insert({ slug: parsed.data.slug, rotulo: parsed.data.rotulo, ordem })
    .select('id')
    .single()
  if (error) return { ok: false, erro: erroDeTipo(error.message, error.code) }

  revalidarTipos()
  return { ok: true, id: data?.id }
}

/**
 * Editar rótulo/ordem e ativar/desativar. O SLUG **não** é parâmetro: slug gravado
 * nunca muda, porque `movimentacoes.itens_faltantes` e `pendencias_item.item` guardam
 * o literal e nada no banco os acompanharia numa renomeação.
 */
export async function atualizarTipoItem(input: {
  id: number
  rotulo: string
  ordem: number
  ativo: boolean
}): Promise<ActionResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = atualizarTipoItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, ...campos } = parsed.data

  const { error } = await supabase.from('tipos_item').update(campos).eq('id', id)
  if (error) return { ok: false, erro: erroDeTipo(error.message, error.code) }

  revalidarTipos()
  return { ok: true }
}

/** Liga (ou desliga, com `null`) o tipo de UM item do catálogo. */
export async function definirTipoDoItem(input: {
  item_id: number
  tipo_id: number | null
}): Promise<ActionResult> {
  const supabase = await createClient()
  const aut = await exigirAdmin(supabase)
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const parsed = tipoDoItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const { error } = await supabase
    .from('itens')
    .update({ tipo_id: parsed.data.tipo_id })
    .eq('id', parsed.data.item_id)
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  revalidarTipos()
  return { ok: true }
}
