'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { traduzErroBanco } from '@/lib/actions/erros'
import {
  devolverFornecedorSchema,
  type DevolverFornecedorInput,
} from '@/lib/validators/devolucao-fornecedor'
import { chavePatrimonio } from '@/lib/patrimonio'
import { buscarAtivoResumo } from '@/lib/queries/ativos'
import { ultimoEnvioManutencao } from '@/lib/queries/movimentacoes'
import type { Json } from '@/lib/types/database'

export type DevolverFornecedorResult = {
  ok: boolean
  antigo?: { id: string; patrimonio: string | null }
  // undefined quando "sem substituto".
  substituto?: { id: string; patrimonio: string }
  erros?: string[]
  erroGeral?: string
}

// F14/MN3–MN4 — devolução ao fornecedor (+ substituto opcional) num submit só.
// Pré-checagens amigáveis + RPC atômica `devolver_ao_fornecedor` (uma transação,
// tudo-ou-nada). Os chamados herdados e o fornecedor do substituto são resolvidos
// no SERVIDOR (aqui e na RPC), nunca no payload do cliente.
export async function devolverAoFornecedor(
  input: DevolverFornecedorInput,
): Promise<DevolverFornecedorResult> {
  const parsed = devolverFornecedorSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      erros: [...new Set(parsed.error.issues.map((i) => i.message))],
    }
  }

  const supabase = await createClient()
  const uid = await idOperador(supabase)
  if (!uid) return { ok: false, erroGeral: MSG_SESSAO_EXPIRADA }

  const dados = parsed.data

  // Pré-checagem amigável: o ativo existe e está em manutenção? (O trigger é o
  // juiz final — transição inválida faz rollback total.)
  const ativo = await buscarAtivoResumo(dados.ativo_id)
  if (!ativo) return { ok: false, erroGeral: 'Ativo não encontrado.' }
  if (ativo.status !== 'em_manutencao') {
    return {
      ok: false,
      erroGeral:
        'A devolução ao fornecedor só vale para um ativo em manutenção.',
    }
  }

  // Colisão do substituto no par (patrimônio + service tag) — §5. Erro amigável
  // ANTES da RPC; a atomicidade da RPC também garante o rollback total se algo
  // escapar (corrida).
  const sub = dados.substituto
  if (sub) {
    const { data: existentes, error: exErr } = await supabase
      .from('ativos')
      .select('patrimonio, service_tag')
      .eq('patrimonio', sub.patrimonio)
    if (exErr) {
      return { ok: false, erroGeral: traduzErroBanco(exErr.message, exErr.code) }
    }
    const existSet = new Set(
      (existentes ?? [])
        .filter(
          (e): e is { patrimonio: string; service_tag: string | null } =>
            e.patrimonio !== null,
        )
        .map((e) => chavePatrimonio(e.patrimonio, e.service_tag)),
    )
    if (existSet.has(chavePatrimonio(sub.patrimonio, sub.service_tag))) {
      return {
        ok: false,
        erros: [
          `Já existe um ativo ${sub.patrimonio} ${sub.service_tag ? `com service tag ${sub.service_tag}` : 'sem service tag'} — use uma service tag distinta.`,
        ],
      }
    }
  }

  // Chamados herdados do ÚLTIMO envio_manutencao (autoridade no servidor).
  const chamados = await ultimoEnvioManutencao(dados.ativo_id)

  const p_mov = {
    data: dados.data,
    chamado: chamados?.chamado ?? null,
    chamado_fornecedor: chamados?.chamado_fornecedor ?? null,
    observacao: dados.observacao ?? null,
  }

  const p_substituto = sub
    ? {
        patrimonio: sub.patrimonio,
        service_tag: sub.service_tag ?? '',
        categoria: sub.categoria,
        marca: sub.marca,
        modelo: sub.modelo,
        memoria: sub.memoria ?? '',
        armazenamento: sub.armazenamento ?? '',
        processador: sub.processador ?? '',
        hostname: sub.hostname ?? '',
        filial_id: sub.filial_id,
        observacoes: sub.observacoes ?? '',
        observacao: sub.observacao ?? '',
        data: sub.data,
      }
    : null

  const { data: res, error } = await supabase.rpc('devolver_ao_fornecedor', {
    p_ativo_id: dados.ativo_id,
    p_mov: p_mov as unknown as Json,
    p_substituto: p_substituto as unknown as Json,
    p_criado_por: uid,
  })

  if (error) {
    return { ok: false, erroGeral: traduzErroBanco(error.message, error.code) }
  }

  const linha = (res ?? [])[0] as
    | { mov_id: string; substituto_id: string | null; substituto_mov_id: string | null }
    | undefined

  revalidatePath('/ativos')
  revalidatePath(`/ativos/${dados.ativo_id}`)
  if (linha?.substituto_id) revalidatePath(`/ativos/${linha.substituto_id}`)
  // F15: a `troca` do substituto entra nas Entradas do relatório ao vivo (rotulada "Troca").
  revalidatePath('/relatorios', 'layout')

  return {
    ok: true,
    antigo: { id: ativo.id, patrimonio: ativo.patrimonio },
    substituto:
      sub && linha?.substituto_id
        ? { id: linha.substituto_id, patrimonio: sub.patrimonio }
        : undefined,
  }
}
