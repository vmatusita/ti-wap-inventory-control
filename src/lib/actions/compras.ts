'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { traduzErroBanco } from '@/lib/actions/erros'
import { compraLoteSchema, type CompraLoteInput } from '@/lib/validators/compra'
import { chavePatrimonio } from '@/lib/patrimonio'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import {
  sugestoesMarcas,
  sugestoesModelos,
  sugestoesFornecedores,
  MIN_CHARS_SUGESTAO,
} from '@/lib/queries/compras'
import type { Json } from '@/lib/types/database'

export type CompraResult = {
  ok: boolean
  criados: { id: string; patrimonio: string }[]
  erros?: string[]
  erroGeral?: string
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
  const uid = await idOperador(supabase)
  if (!uid) {
    return { ok: false, criados: [], erroGeral: MSG_SESSAO_EXPIRADA }
  }

  const dados = parsed.data
  const erros: string[] = []

  // Duplicidade DENTRO do lote.
  const vistos = new Set<string>()
  for (const it of dados.itens) {
    const k = chavePatrimonio(it.patrimonio, it.service_tag)
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
    return { ok: false, criados: [], erroGeral: traduzErroBanco(exErr.message, exErr.code) }
  }
  // Um lote de compra sempre tem patrimônio canônico; ativos existentes sem
  // patrimônio (F7E) nunca colidem com ele — filtra os nulos antes da chave.
  const existSet = new Set(
    (existentes ?? [])
      .filter((e): e is { patrimonio: string; service_tag: string | null } => e.patrimonio !== null)
      .map((e) => chavePatrimonio(e.patrimonio, e.service_tag)),
  )
  for (const it of dados.itens) {
    if (existSet.has(chavePatrimonio(it.patrimonio, it.service_tag))) {
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
    p_criado_por: uid,
  })

  if (error) {
    return { ok: false, criados: [], erroGeral: traduzErroBanco(error.message, error.code) }
  }

  revalidatePath('/ativos')
  // Compras entram como estoque disponivel — o relatorio ao vivo precisa refletir.
  revalidatePath('/relatorios', 'layout')
  return {
    ok: true,
    criados: (criados ?? []).map((c) => ({ id: c.ativo_id, patrimonio: c.patrimonio })),
  }
}

// ---------------------------------------------------------------------------
// A4 (F10) — proxies client→server das sugestões do acervo. Mesmo padrão de
// `buscarAtivosParaMovimentacao`: o form roda em Client Component e NÃO pode
// importar `src/lib/queries/`. Degradam para lista vazia (sugestão é conforto,
// não pode derrubar o cadastro) mas registram no log do servidor — falha
// sistemática de RLS/rede tem de ser visível.
// ---------------------------------------------------------------------------

async function sugerir(
  rotulo: string,
  prefixo: string,
  consultar: () => Promise<string[]>,
): Promise<string[]> {
  if (prefixo.trim().length < MIN_CHARS_SUGESTAO) return []
  try {
    return await consultar()
  } catch (err) {
    console.error(`[sugestoes] falha ao sugerir ${rotulo}:`, err)
    return []
  }
}

export async function buscarSugestoesMarca(prefixo: string): Promise<string[]> {
  return sugerir('marcas', prefixo, () => sugestoesMarcas(prefixo))
}

export async function buscarSugestoesModelo(
  marca: string | null,
  prefixo: string,
): Promise<string[]> {
  return sugerir('modelos', prefixo, () => sugestoesModelos(marca, prefixo))
}

export async function buscarSugestoesFornecedor(
  prefixo: string,
): Promise<string[]> {
  return sugerir('fornecedores', prefixo, () => sugestoesFornecedores(prefixo))
}
