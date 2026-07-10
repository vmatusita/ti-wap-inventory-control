'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { traduzErroBanco } from '@/lib/actions/erros'
import { hojeISO } from '@/lib/format'
import {
  loteMovimentacaoSchema,
  estornoActionSchema,
  type MovimentacaoInput,
} from '@/lib/validators/movimentacao'
import {
  buscarAtivosParaCombobox,
  type AtivoResumo,
} from '@/lib/queries/ativos'

// ---------------------------------------------------------------------------
// Resultado do lote (OS-F2 3.4.1): quais entraram e qual falhou.
// ---------------------------------------------------------------------------
export type ItemResultado = {
  index: number
  ativo_id: string
  ok: boolean
  movimentacao_id?: string
  erro?: string
}

export type RegistrarLoteResult = {
  ok: boolean
  criadas: number
  resultados: ItemResultado[]
  erroGeral?: string
}

type AtivoBasico = { id: string; filial_id: number; status: string }

// Le campo opcional de um item validado sem brigar com a uniao discriminada.
function campo(item: MovimentacaoInput, chave: string): unknown {
  return (item as unknown as Record<string, unknown>)[chave]
}

// Registra um LOTE de 1..10 movimentacoes, inserindo uma a uma em ordem. Se o
// banco rejeitar alguma (transicao invalida), interrompe e devolve o que entrou
// mais o item que falhou (as anteriores ja estao commitadas — cada insert e uma
// transacao). OS-F2 3.4.1.
export async function registrarMovimentacoes(input: {
  itens: MovimentacaoInput[]
}): Promise<RegistrarLoteResult> {
  const parsed = loteMovimentacaoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      criadas: 0,
      resultados: [],
      erroGeral: 'Há campos inválidos no lote. Revise os itens.',
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      criadas: 0,
      resultados: [],
      erroGeral: 'Sua sessão expirou. Faça login novamente.',
    }
  }

  const itens = parsed.data.itens

  // Um ativo não pode aparecer duas vezes no MESMO lote: o estado corrente é lido
  // uma vez (mapa abaixo) e não é reidratado durante o loop, então uma 2ª linha
  // do mesmo ativo usaria filial/estado obsoletos. A UI já deduplica; aqui é a
  // barreira da Server Action contra payload forjado.
  const ids = [...new Set(itens.map((i) => i.ativo_id))]
  if (ids.length !== itens.length) {
    return {
      ok: false,
      criadas: 0,
      resultados: [],
      erroGeral: 'O lote não pode repetir o mesmo ativo. Registre em lotes separados.',
    }
  }

  // Estado corrente de cada ativo (filial de origem + status atual).
  const { data: ativosData, error: ativosErr } = await supabase
    .from('ativos')
    .select('id, filial_id, status')
    .in('id', ids)
  if (ativosErr) {
    return {
      ok: false,
      criadas: 0,
      resultados: [],
      erroGeral: traduzErroBanco(ativosErr.message),
    }
  }
  const ativoPorId = new Map<string, AtivoBasico>(
    (ativosData ?? []).map((a) => [a.id, a as AtivoBasico]),
  )

  const resultados: ItemResultado[] = []
  const rotasAtivos = new Set<string>()
  let criadas = 0
  let interrompido = false

  for (let index = 0; index < itens.length; index++) {
    const item = itens[index]

    if (interrompido) {
      resultados.push({
        index,
        ativo_id: item.ativo_id,
        ok: false,
        erro: 'Não processado — o lote foi interrompido em um item anterior.',
      })
      continue
    }

    const ativo = ativoPorId.get(item.ativo_id)
    if (!ativo) {
      resultados.push({
        index,
        ativo_id: item.ativo_id,
        ok: false,
        erro: 'Ativo não encontrado.',
      })
      interrompido = true
      continue
    }

    // Transferencia: destino tem de ser diferente da filial atual (OS-F2 3.3.1).
    if (item.tipo === 'transferencia' && item.filial_destino_id === ativo.filial_id) {
      resultados.push({
        index,
        ativo_id: item.ativo_id,
        ok: false,
        erro: 'A filial de destino deve ser diferente da atual.',
      })
      interrompido = true
      continue
    }

    const row = {
      ativo_id: item.ativo_id,
      tipo: item.tipo,
      motivo: (campo(item, 'motivo') as string | undefined) ?? null,
      data: item.data,
      filial_id: ativo.filial_id, // origem (a corrente do ativo)
      filial_destino_id:
        item.tipo === 'transferencia' ? item.filial_destino_id : null,
      colaborador: (campo(item, 'colaborador') as string | undefined) ?? null,
      setor: (campo(item, 'setor') as string | undefined) ?? null,
      chamado: (campo(item, 'chamado') as string | undefined) ?? null,
      termo_assinado: item.termo_assinado ?? null,
      termo_data: item.termo_data ?? null,
      itens_faltantes:
        item.tipo === 'devolucao' ? item.itens_faltantes ?? [] : null,
      observacao: item.observacao ?? null,
      // Ajuste: o trigger LE o status_resultante; nos demais ele o CALCULA.
      status_resultante:
        item.tipo === 'ajuste' ? item.status_resultante : null,
      criado_por: user.id,
    }

    const { data: inserida, error: insertErr } = await supabase
      .from('movimentacoes')
      .insert(row)
      .select('id')
      .single()

    if (insertErr) {
      resultados.push({
        index,
        ativo_id: item.ativo_id,
        ok: false,
        erro: traduzErroBanco(insertErr.message),
      })
      interrompido = true
      continue
    }

    criadas++
    rotasAtivos.add(item.ativo_id)
    resultados.push({
      index,
      ativo_id: item.ativo_id,
      ok: true,
      movimentacao_id: inserida?.id,
    })
  }

  if (criadas > 0) {
    revalidatePath('/ativos')
    revalidatePath('/movimentacoes/nova')
    for (const id of rotasAtivos) revalidatePath(`/ativos/${id}`)
  }

  return {
    ok: resultados.every((r) => r.ok),
    criadas,
    resultados,
  }
}

// ---------------------------------------------------------------------------
// Estorno da ULTIMA movimentacao (OS-F2 3.6). O trigger valida "so a ultima".
// ---------------------------------------------------------------------------
export type EstornoResult = { ok: boolean; erro?: string }

export async function estornarMovimentacao(input: {
  movimentacao_id: string
  observacao?: string
}): Promise<EstornoResult> {
  const parsed = estornoActionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: 'Dados inválidos para o estorno.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'Sua sessão expirou. Faça login novamente.' }

  // Movimentacao original -> ativo (e, dele, a filial corrente p/ o insert).
  const { data: mov, error: movErr } = await supabase
    .from('movimentacoes')
    .select('id, ativo_id, tipo')
    .eq('id', parsed.data.movimentacao_id)
    .maybeSingle()
  if (movErr) return { ok: false, erro: traduzErroBanco(movErr.message) }
  if (!mov) return { ok: false, erro: 'Movimentação não encontrada.' }

  const { data: ativo, error: ativoErr } = await supabase
    .from('ativos')
    .select('id, filial_id')
    .eq('id', mov.ativo_id)
    .single()
  if (ativoErr) return { ok: false, erro: traduzErroBanco(ativoErr.message) }

  const { error: insertErr } = await supabase.from('movimentacoes').insert({
    ativo_id: mov.ativo_id,
    tipo: 'estorno',
    estorno_de: mov.id,
    data: hojeISO(),
    filial_id: ativo.filial_id,
    observacao: parsed.data.observacao ?? null,
    criado_por: user.id,
  })

  if (insertErr) return { ok: false, erro: traduzErroBanco(insertErr.message) }

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${mov.ativo_id}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Busca de ativos p/ o combobox do fluxo de nova movimentacao (chamada do
// cliente com debounce). RLS garante que so o operador logado le.
// ---------------------------------------------------------------------------
export async function buscarAtivosParaMovimentacao(
  term: string,
): Promise<AtivoResumo[]> {
  try {
    return await buscarAtivosParaCombobox(term)
  } catch {
    return []
  }
}
