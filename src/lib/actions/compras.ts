'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { traduzErroBanco } from '@/lib/actions/erros'
import { compraLoteSchema, type CompraLoteInput } from '@/lib/validators/compra'
import type { Json } from '@/lib/types/database'

export type CompraResult = {
  ok: boolean
  criados: { id: string; patrimonio: string }[]
  erros?: string[]
  erroGeral?: string
}

// Chave de unicidade real do ativo (§5): patrimônio + service tag (o índice do
// banco usa coalesce(service_tag, '')). Aqui espelhamos exatamente.
function chave(patrimonio: string, serviceTag?: string | null): string {
  return `${patrimonio}::${serviceTag ?? ''}`
}

// Entrada de equipamento novo (compra), single ou lote — TUDO OU NADA (OS-F2
// 3.5.5). A pré-checagem dá erros amigáveis apontando o patrimônio; a atomicidade
// e a corrida ficam garantidas pela função `criar_compra_lote` (uma transação) +
// índice único do banco.
export async function registrarCompra(
  input: CompraLoteInput,
): Promise<CompraResult> {
  const parsed = compraLoteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      criados: [],
      erros: [...new Set(parsed.error.issues.map((i) => i.message))],
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      criados: [],
      erroGeral: 'Sua sessão expirou. Faça login novamente.',
    }
  }

  const dados = parsed.data
  const erros: string[] = []

  // Duplicidade DENTRO do lote.
  const vistos = new Set<string>()
  for (const it of dados.itens) {
    const k = chave(it.patrimonio, it.service_tag)
    if (vistos.has(k)) {
      erros.push(
        `Patrimônio repetido no lote: ${it.patrimonio}${it.service_tag ? ` (service tag ${it.service_tag})` : ''}.`,
      )
    }
    vistos.add(k)
  }

  // Duplicidade contra o que já existe no banco (§5: precisa de service tag distinta).
  const patrimonios = [...new Set(dados.itens.map((i) => i.patrimonio))]
  const { data: existentes, error: exErr } = await supabase
    .from('ativos')
    .select('patrimonio, service_tag')
    .in('patrimonio', patrimonios)
  if (exErr) {
    return { ok: false, criados: [], erroGeral: traduzErroBanco(exErr.message) }
  }
  const existSet = new Set(
    (existentes ?? []).map((e) => chave(e.patrimonio, e.service_tag)),
  )
  for (const it of dados.itens) {
    if (existSet.has(chave(it.patrimonio, it.service_tag))) {
      erros.push(
        `Já existe um ativo ${it.patrimonio} ${it.service_tag ? `com service tag ${it.service_tag}` : 'sem service tag'} — use uma service tag distinta.`,
      )
    }
  }

  if (erros.length > 0) {
    return { ok: false, criados: [], erros: [...new Set(erros)] }
  }

  // Payload da RPC: cada item carrega os dados cadastrais compartilhados + o
  // patrimônio/service tag próprios. A observação (nº da nota) vai na movimentação.
  const p_itens = dados.itens.map((it) => ({
    patrimonio: it.patrimonio,
    patrimonio_original: it.patrimonio,
    service_tag: it.service_tag ?? '',
    categoria: dados.categoria,
    marca: dados.marca,
    modelo: dados.modelo,
    memoria: dados.memoria ?? '',
    armazenamento: dados.armazenamento ?? '',
    processador: dados.processador ?? '',
    fornecedor: dados.fornecedor ?? '',
    filial_id: dados.filial_id,
    observacoes: '',
    observacao: dados.observacao ?? '',
    data: dados.data,
  }))

  const { data: criados, error } = await supabase.rpc('criar_compra_lote', {
    p_itens: p_itens as unknown as Json,
    p_criado_por: user.id,
  })

  if (error) {
    return { ok: false, criados: [], erroGeral: traduzErroBanco(error.message) }
  }

  revalidatePath('/ativos')
  return {
    ok: true,
    criados: (criados ?? []).map((c) => ({ id: c.ativo_id, patrimonio: c.patrimonio })),
  }
}
