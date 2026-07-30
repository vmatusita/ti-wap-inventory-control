'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirPapel } from '@/lib/auth/acesso'
import { createClient } from '@/lib/supabase/server'
import { traduzErroBanco } from '@/lib/actions/erros'
import { formatDate, hojeISO } from '@/lib/format'
import { semanaUtilCorrente } from '@/lib/relatorios/periodo'
import {
  getSnapshotRelatorioV2,
  resolverFilialPorSlug,
} from '@/lib/queries/relatorios'
import { dataRealSchema } from '@/lib/validators/data'
import type { Json } from '@/lib/types/database'

const periodoSchema = z.object({
  filialSlug: z.string().min(1),
  // `dataRealSchema` e não só o regex de formato: `2026-02-30` casa o regex, passa
  // no teto (`ate <= hoje`) e só quebra lá dentro, na RPC as-of, virando "Falha ao
  // montar o relatório" em vez de "Período inválido para a geração".
  de: dataRealSchema('Data inicial inválida'),
  ate: dataRealSchema('Data final inválida'),
  // B4 (F6B): observação da semana — texto livre opcional definido no ato de gerar.
  observacao: z.string().trim().max(2000, 'Observação: no máximo 2000 caracteres').optional(),
})

// Gera o relatório da semana (snapshot congelado — spec §7.1 / OS-F3 3.8.2 /
// F3B 3.10.1: grava o objeto schema 2, com as-of do período).
// Cargo mínimo OPERADOR (F21). Calcula o snapshot, versiona (max+1 para o mesmo
// período+filial) e insere. Imutável — regerar cria versão nova.
export type GerarRelatorioResult =
  | { ok: true; id: string; versao: number }
  | { ok: false; erro: string }

export async function gerarRelatorio(input: {
  filialSlug: string
  de: string
  ate: string
  observacao?: string
}): Promise<GerarRelatorioResult> {
  const parsed = periodoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, erro: 'Período inválido para a geração.' }
  }
  const { filialSlug, de, ate, observacao } = parsed.data
  // Trim já aplicado pelo Zod; obs vazia (ou só espaços) vira ausência (null).
  const obs = observacao && observacao.length > 0 ? observacao : null
  if (de > ate) {
    return { ok: false, erro: 'A data inicial não pode ser depois da final.' }
  }
  // Teto: não congelar snapshot de período futuro. Aceita até hoje OU o fim da
  // semana útil corrente (o padrão do dialog é a sexta desta semana, que gerado
  // no meio da semana é "futuro" mas legítimo) — o que for maior.
  const fimSemana = semanaUtilCorrente().ate
  const teto = hojeISO() > fimSemana ? hojeISO() : fimSemana
  if (ate > teto) {
    return { ok: false, erro: 'A data final não pode ser no futuro.' }
  }

  const client = await createClient()
  // Cargo mínimo OPERADOR, SEM recorte de filial — inclusive para o consolidado
  // ('geral', `filial_id` null). É o que a policy de INSERT de `relatorios_gerados`
  // diz (`papel_atual() in ('admin','operador')`, migration 0063) e o que a ADR-002 §3
  // prevê: congelar snapshot é registrar o que já se pode LER, e leitura é ampla para
  // todo logado. Consulta é recusado com a mensagem única de somente-leitura, no lugar
  // do texto próprio que esta action tinha ('Apenas operadores logados…') — era a única
  // do repositório fora das constantes de `auth/acesso`.
  const aut = await exigirPapel(client, 'operador')
  if (!aut.ok) return { ok: false, erro: aut.erro }

  const filial =
    filialSlug === 'geral' ? null : await resolverFilialPorSlug(client, filialSlug)
  if (filialSlug !== 'geral' && !filial) {
    return { ok: false, erro: 'Filial não encontrada.' }
  }
  const filialId = filial?.id ?? null

  let snapshot
  try {
    snapshot = await getSnapshotRelatorioV2(client, filialSlug, {
      de,
      ate,
      rotulo: `${formatDate(de)} a ${formatDate(ate)}`,
    })
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : 'Falha ao montar o relatório.',
    }
  }

  // A obs é do ATO de gerar (o relatório ao vivo não a tem): injeta no snapshot
  // congelado para o corpo renderizar de forma autossuficiente (operador e viewer),
  // além de gravar na coluna (a lista de gerados indica quais têm obs sem parsear
  // o jsonb). Só grava quando há texto — snapshots sem obs não têm o campo.
  if (obs) snapshot.meta.observacao = obs

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
      gerado_por: aut.uid,
      observacao: obs,
    })
    .select('id')
    .single()

  if (error || !inserido) {
    return { ok: false, erro: traduzErroBanco(error?.message, error?.code) }
  }

  revalidatePath('/relatorios/gerados')
  return { ok: true, id: inserido.id, versao }
}
