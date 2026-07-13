'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getOperador, resolverAcessoRelatorio } from '@/lib/auth/acesso'
import { createClient } from '@/lib/supabase/server'
import { traduzErroBanco } from '@/lib/actions/erros'
import { formatDate } from '@/lib/format'
import {
  getSnapshotRelatorio,
  getTodasMovimentacoesPeriodo,
  resolverFilialPorSlug,
  CAPS,
} from '@/lib/queries/relatorios'
import type { MovimentacaoRelatorio } from '@/lib/relatorios/tipos'
import type { Json } from '@/lib/types/database'

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const periodoSchema = z.object({
  filialSlug: z.string().min(1),
  de: z.string().regex(DATA_RE, 'Data inicial inválida'),
  ate: z.string().regex(DATA_RE, 'Data final inválida'),
})

// Export CSV do período (OS-F3 3.5.1): busca TODAS as movimentações do período
// (paginado). Serve operador (RLS) e visualizador por senha (client admin) —
// resolverAcessoRelatorio decide o client. Sem acesso → lista vazia.
export async function exportarMovimentacoesRelatorio(
  filialSlug: string,
  de: string,
  ate: string,
): Promise<MovimentacaoRelatorio[]> {
  const parsed = periodoSchema.safeParse({ filialSlug, de, ate })
  if (!parsed.success) return []

  const acesso = await resolverAcessoRelatorio()
  if (!acesso) return []
  const { client } = acesso

  const filial =
    filialSlug === 'geral' ? null : await resolverFilialPorSlug(client, filialSlug)
  if (filialSlug !== 'geral' && !filial) return []

  try {
    return await getTodasMovimentacoesPeriodo(client, filial?.id ?? null, {
      de,
      ate,
    })
  } catch {
    return []
  }
}

// Gera o relatório da semana (snapshot congelado — spec §7.1 / OS-F3 3.8.2).
// SÓ operador logado. Calcula o snapshot, versiona (max+1 para o mesmo período+
// filial) e insere. Imutável — regerar cria versão nova.
export type GerarRelatorioResult =
  | { ok: true; id: string; versao: number }
  | { ok: false; erro: string }

export async function gerarRelatorio(input: {
  filialSlug: string
  de: string
  ate: string
}): Promise<GerarRelatorioResult> {
  const parsed = periodoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: 'Período inválido para a geração.' }
  }
  const { filialSlug, de, ate } = parsed.data
  if (de > ate) {
    return { ok: false, erro: 'A data inicial não pode ser depois da final.' }
  }

  const operador = await getOperador()
  if (!operador) {
    return { ok: false, erro: 'Apenas operadores logados podem gerar relatórios.' }
  }

  const client = await createClient()
  const filial =
    filialSlug === 'geral' ? null : await resolverFilialPorSlug(client, filialSlug)
  if (filialSlug !== 'geral' && !filial) {
    return { ok: false, erro: 'Filial não encontrada.' }
  }
  const filialId = filial?.id ?? null

  let snapshot
  try {
    snapshot = await getSnapshotRelatorio(
      client,
      filialSlug,
      { de, ate, rotulo: `${formatDate(de)} a ${formatDate(ate)}` },
      { maxMovimentacoes: CAPS.snapshot },
    )
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : 'Falha ao montar o relatório.',
    }
  }

  // Versão = max(versao)+1 para o mesmo (período, filial). filial null = geral.
  let versaoQuery = client
    .from('relatorios_gerados')
    .select('versao')
    .eq('periodo_de', de)
    .eq('periodo_ate', ate)
  versaoQuery =
    filialId === null
      ? versaoQuery.is('filial_id', null)
      : versaoQuery.eq('filial_id', filialId)
  const { data: ultima } = await versaoQuery
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()
  const versao = (ultima?.versao ?? 0) + 1

  const { data: inserido, error } = await client
    .from('relatorios_gerados')
    .insert({
      periodo_de: de,
      periodo_ate: ate,
      filial_id: filialId,
      versao,
      dados: snapshot as unknown as Json,
      gerado_por: operador.id,
    })
    .select('id')
    .single()

  if (error || !inserido) {
    return { ok: false, erro: traduzErroBanco(error?.message) }
  }

  revalidatePath('/relatorios/gerados')
  return { ok: true, id: inserido.id, versao }
}
