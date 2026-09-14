'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exigirEscritaEm, exigirPapel } from '@/lib/auth/acesso'
import { traduzErroBanco } from '@/lib/actions/erros'
import {
  devolverFornecedorSchema,
  type DevolverFornecedorInput,
} from '@/lib/validators/devolucao-fornecedor'
import {
  ALCANCE_DA_RECUSA_MANUAL,
  cadastrosComMesmaIdentidade,
  recusasDeIdentidadeNoAcervo,
} from '@/lib/ativos/identidade'
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
  const cargo = await exigirPapel(supabase, 'operador')
  if (!cargo.ok) return { ok: false, erroGeral: cargo.erro }

  const dados = parsed.data

  // Pré-checagem amigável: o ativo existe e está em manutenção? (O trigger é o
  // juiz final — transição inválida faz rollback total.)
  const ativo = await buscarAtivoResumo(dados.ativo_id)
  if (!ativo) return { ok: false, erroGeral: 'Ativo não encontrado.' }

  // DUAS filiais podem ser escritas num submit só: a do ativo devolvido (baixa) e a do
  // substituto que nasce (parâmetro do formulário — nada obriga que sejam a mesma).
  // A RPC é SECURITY INVOKER, então as policies da 0063 já exigem o vínculo nas duas;
  // aqui a recusa vem antes, com mensagem em pt-BR, e é do LOTE INTEIRO — meia
  // devolução (baixa sem substituto, ou vice-versa) seria pior que a recusa.
  const aut = await exigirEscritaEm(supabase, [ativo.filial_id, dados.substituto?.filial_id])
  if (!aut.ok) return { ok: false, erroGeral: aut.erro }

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
  // F57 — a consulta é a mesma da compra (`ativos/identidade.ts`), com o alcance de TODAS as
  // unidades: o substituto nasce por cadastro, e cadastro nunca abre conflito entre filiais.
  const sub = dados.substituto
  if (sub) {
    const noAcervo = await cadastrosComMesmaIdentidade(
      supabase,
      [{ patrimonio: sub.patrimonio, serviceTag: sub.service_tag }],
      { alcance: ALCANCE_DA_RECUSA_MANUAL },
    )
    if (!noAcervo.ok) {
      return { ok: false, erroGeral: traduzErroBanco(noAcervo.erro.message, noAcervo.erro.code) }
    }
    const recusas = recusasDeIdentidadeNoAcervo([sub], noAcervo.porChave)
    if (recusas.length > 0) return { ok: false, erros: recusas }
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
    p_criado_por: aut.uid,
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
