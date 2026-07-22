'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco, type ActionResult } from '@/lib/actions/erros'
import { hojeISO } from '@/lib/format'
import {
  estornoLancamentoSchema,
  explodirLoteLancamentoItem,
  itemCatalogoSchema,
  itemInlineSchema,
  atualizarItemSchema,
  loteLancamentoItemSchema,
  proximaOrdemDoGrupo,
  type LoteLancamentoItemInput,
} from '@/lib/validators/item'
import type { TipoLancamento } from '@/lib/dominio'
import { planejarEstorno } from '@/lib/itens/estorno'

async function operadorId(): Promise<string | null> {
  const supabase = await createClient()
  return idOperador(supabase)
}

// Resultado POR LINHA do carrinho (F10 · I1). Espelha o lote de movimentações da
// F2 — com uma diferença INTENCIONAL: lá a primeira falha interrompe o resto;
// aqui cada linha é independente (um item sem saldo não impede os outros).
export type ResultadoLinhaLancamento = {
  itemId: number
  ok: boolean
  erro?: string
}

export type LancarItensResult = {
  ok: boolean
  resultados: ResultadoLinhaLancamento[]
  /** Falha ANTES de tocar o banco (sessão expirada, payload inválido). */
  erroGeral?: string
}

// Lança um CARRINHO de itens (1..MAX_LINHAS_LOTE_ITEM) sobre os mesmos campos
// comuns (filial, tipo, data, chamado, colaborador, observação): um insert por
// linha, sequencial, em ordem. A regra crítica (saldo/atrelados nunca negativos)
// é do trigger 0015/0027 — aqui é a segunda linha; o erro do banco vira pt-BR
// amigável e fica preso à SUA linha, sem derrubar as demais.
export async function lancarItens(input: LoteLancamentoItemInput): Promise<LancarItensResult> {
  const uid = await operadorId()
  if (!uid) return { ok: false, resultados: [], erroGeral: MSG_SESSAO_EXPIRADA }

  const parsed = loteLancamentoItemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      resultados: [],
      erroGeral: parsed.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const supabase = await createClient()
  const resultados: ResultadoLinhaLancamento[] = []
  let criados = 0

  for (const v of explodirLoteLancamentoItem(parsed.data)) {
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
    if (error) {
      resultados.push({
        itemId: v.item_id,
        ok: false,
        erro: traduzErroBanco(error.message, error.code),
      })
      continue
    }
    criados++
    resultados.push({ itemId: v.item_id, ok: true })
  }

  if (criados > 0) {
    revalidatePath('/itens')
    revalidatePath('/relatorios', 'layout')
  }
  return { ok: resultados.every((r) => r.ok), resultados }
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
  if (e1) return { ok: false, erro: traduzErroBanco(e1.message, e1.code) }
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

  const plano = planejarEstorno({
    tipo: orig.tipo as TipoLancamento,
    quantidade: orig.quantidade,
    chamado: orig.chamado,
    observacao: orig.observacao,
  })
  const { error: e2 } = await supabase.from('lancamentos_item').insert({
    item_id: orig.item_id,
    filial_id: orig.filial_id,
    tipo: plano.tipo,
    quantidade: plano.quantidade,
    chamado: plano.chamado,
    colaborador: null,
    data: hojeISO(),
    observacao: plano.observacao,
    criado_por: uid,
    estorna_id: orig.id,
  })
  if (e2) return { ok: false, erro: traduzErroBanco(e2.message, e2.code) }

  revalidatePath('/itens')
  revalidatePath('/relatorios', 'layout')
  return { ok: true }
}

// ---- Catálogo (admin/itens — padrão de admin/motivos) ----

// O `id` só volta em sucesso — o criar inline (F10 · I2) precisa dele para já
// deixar o item novo SELECIONADO na linha do carrinho. Quem só lê `ok` (o dialog
// de admin/itens) continua compatível.
export type CriarItemResult = ActionResult & { id?: number }

export async function criarItem(input: {
  nome: string
  grupo: string
  ordem: number
}): Promise<CriarItemResult> {
  const uid = await operadorId()
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }
  const parsed = itemCatalogoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('itens')
    .insert(parsed.data)
    .select('id')
    .single()
  if (error) {
    if (error.message.toLowerCase().includes('duplicate') || error.message.includes('itens_nome_uidx')) {
      return { ok: false, erro: 'Já existe um item com esse nome.' }
    }
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  }
  revalidatePath('/admin/itens')
  revalidatePath('/itens')
  return { ok: true, id: data?.id }
}

// Criação INLINE no meio do lançamento (F10 · I2): o operador informa só nome e
// grupo; a `ordem` é decidida AQUI (maior do grupo + 10) — o combobox do
// lançamento nem carrega essa coluna. Reusa `criarItem` (mesma validação, mesma
// tradução de nome duplicado, mesmos revalidatePath). Todo operador é admin
// (nível único, CLAUDE.md) — não há gate de permissão a checar.
export async function criarItemInline(input: {
  nome: string
  grupo: string
}): Promise<CriarItemResult> {
  const uid = await operadorId()
  if (!uid) return { ok: false, erro: MSG_SESSAO_EXPIRADA }
  const parsed = itemInlineSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createClient()
  const { data: maior, error } = await supabase
    .from('itens')
    .select('ordem')
    .eq('grupo', parsed.data.grupo)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }

  return criarItem({
    nome: parsed.data.nome,
    grupo: parsed.data.grupo,
    ordem: proximaOrdemDoGrupo(maior?.ordem ?? null),
  })
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
    return { ok: false, erro: traduzErroBanco(error.message, error.code) }
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
  if (error) return { ok: false, erro: traduzErroBanco(error.message, error.code) }
  revalidatePath('/admin/itens')
  revalidatePath('/itens')
  return { ok: true }
}
