'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { hojeISO } from '@/lib/format'
import {
  lancamentoItemSchema,
  estornoLancamentoSchema,
  itemCatalogoSchema,
  atualizarItemSchema,
  type LancamentoItemInput,
} from '@/lib/validators/item'
import type { TipoLancamento } from '@/lib/dominio'

async function operadorId(): Promise<string | null> {
  const supabase = await createClient()
  return idOperador(supabase)
}

// Lança uma movimentação de quantidade (entrada/saida/reserva/liberacao/ajuste).
// A regra crítica (saldo/atrelados nunca negativos) é do trigger 0015 — aqui é a
// segunda linha. O erro do banco é traduzido para pt-BR amigável.
export async function lancarItem(input: LancamentoItemInput): Promise<ActionResult> {
  const uid = await operadorId()
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const parsed = lancamentoItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const v = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('lancamentos_item').insert({
    item_id: v.item_id,
    filial_id: v.filial_id,
    tipo: v.tipo,
    quantidade: v.quantidade,
    chamado: v.chamado ?? null,
    colaborador: v.colaborador ?? null,
    data: v.data,
    observacao: v.observacao ?? null,
    criado_por: uid,
  })
  if (error) return { ok: false, erro: traduzErroBanco(error.message) }

  revalidatePath('/itens')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// Inverso de cada tipo (correção = lançamento inverso vinculado — a linha some
// nunca; regra do sistema).
const INVERSO: Record<TipoLancamento, TipoLancamento> = {
  entrada: 'saida',
  saida: 'entrada',
  reserva: 'liberacao',
  liberacao: 'reserva',
  ajuste: 'ajuste',
}

// Estorna um lançamento criando o INVERSO com estorna_id. Nada se apaga. O banco
// impede duplo estorno (índice único em estorna_id) e valida o saldo do inverso.
export async function estornarLancamento(input: {
  lancamento_id: string
}): Promise<ActionResult> {
  const uid = await operadorId()
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }

  const parsed = estornoLancamentoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, erro: 'Lançamento inválido.' }

  const supabase = await createClient()
  const { data: orig, error: e1 } = await supabase
    .from('lancamentos_item')
    .select('id, item_id, filial_id, tipo, quantidade, chamado, observacao, estorna_id')
    .eq('id', parsed.data.lancamento_id)
    .maybeSingle()
  if (e1) return { ok: false, erro: traduzErroBanco(e1.message) }
  if (!orig) return { ok: false, erro: 'Lançamento não encontrado.' }
  if (orig.estorna_id) {
    return { ok: false, erro: 'Um estorno não pode ser estornado.' }
  }

  // Já estornado? (o índice único protege da corrida; aqui é a mensagem amigável)
  const { data: jaEstorno } = await supabase
    .from('lancamentos_item')
    .select('id')
    .eq('estorna_id', orig.id)
    .maybeSingle()
  if (jaEstorno) return { ok: false, erro: 'Este lançamento já foi estornado.' }

  const tipoInverso = INVERSO[orig.tipo as TipoLancamento]
  const ehAjuste = orig.tipo === 'ajuste'
  const { error: e2 } = await supabase.from('lancamentos_item').insert({
    item_id: orig.item_id,
    filial_id: orig.filial_id,
    tipo: tipoInverso,
    // ajuste inverte o sinal; os demais repetem a quantidade no tipo oposto.
    quantidade: ehAjuste ? -orig.quantidade : orig.quantidade,
    // reserva/liberacao carregam o chamado (obrigatório); entrada/saida não.
    chamado: tipoInverso === 'reserva' || tipoInverso === 'liberacao' ? orig.chamado : null,
    colaborador: null,
    data: hojeISO(),
    observacao: ehAjuste ? `Estorno de ajuste (${orig.observacao ?? '—'})`.slice(0, 500) : null,
    criado_por: uid,
    estorna_id: orig.id,
  })
  if (e2) return { ok: false, erro: traduzErroBanco(e2.message) }

  revalidatePath('/itens')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---- Catálogo (admin/itens — padrão de admin/motivos) ----

export async function criarItem(input: {
  nome: string
  grupo: string
  ordem: number
}): Promise<ActionResult> {
  const uid = await operadorId()
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }
  const parsed = itemCatalogoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('itens').insert(parsed.data)
  if (error) {
    if (error.message.toLowerCase().includes('duplicate') || error.message.includes('itens_nome_uidx')) {
      return { ok: false, erro: 'Já existe um item com esse nome.' }
    }
    return { ok: false, erro: traduzErroBanco(error.message) }
  }
  revalidatePath('/admin/itens')
  revalidatePath('/itens')
  return { ok: true }
}

// Item nunca é excluído quando tem lançamentos (o histórico referencia) — só
// editado/desativado. A tela mostra a contagem; aqui reconferimos no servidor.
export async function atualizarItem(input: {
  id: number
  nome: string
  grupo: string
  ordem: number
  ativo: boolean
}): Promise<ActionResult> {
  const uid = await operadorId()
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }
  const parsed = atualizarItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }
  const { id, nome, grupo, ordem, ativo } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('itens')
    .update({ nome, grupo, ordem, ativo })
    .eq('id', id)
  if (error) {
    if (error.message.toLowerCase().includes('duplicate') || error.message.includes('itens_nome_uidx')) {
      return { ok: false, erro: 'Já existe um item com esse nome.' }
    }
    return { ok: false, erro: traduzErroBanco(error.message) }
  }
  revalidatePath('/admin/itens')
  revalidatePath('/itens')
  return { ok: true }
}

// Exclusão só quando NÃO houver lançamentos (senão o histórico ficaria órfão);
// caso contrário, a tela oferece desativar.
export async function excluirItem(input: { id: number }): Promise<ActionResult> {
  const uid = await operadorId()
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: 'Item inválido.' }

  const supabase = await createClient()
  const { count } = await supabase
    .from('lancamentos_item')
    .select('*', { count: 'exact', head: true })
    .eq('item_id', id)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      erro: `Não é possível excluir: há ${count} lançamento(s) para este item. Desative-o em vez de excluir.`,
    }
  }

  const { error } = await supabase.from('itens').delete().eq('id', id)
  if (error) return { ok: false, erro: traduzErroBanco(error.message) }
  revalidatePath('/admin/itens')
  revalidatePath('/itens')
  return { ok: true }
}
