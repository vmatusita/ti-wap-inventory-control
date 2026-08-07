'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirPapel } from '@/lib/auth/acesso'
import { createClient } from '@/lib/supabase/server'
import { traduzErroBanco } from '@/lib/actions/erros'
import { formatDate, hojeISO } from '@/lib/format'
import { semanaUtilCorrente } from '@/lib/relatorios/periodo'
import {
  ehViolacaoDeVersao,
  type VersaoExistente,
} from '@/lib/relatorios/versao-snapshot'
import {
  getSnapshotRelatorioV2,
  resolverFilialPorSlug,
  type DbClient,
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
  //
  // F29/REL-04c — a leitura e a inserção são dois passos, e entre eles cabe outro
  // operador. O empate NÃO produz duplicata: o banco recusa desde a migration 0013
  // (ver `lib/relatorios/versao-snapshot.ts`). O que se perdia era o trabalho — o
  // segundo operador levava um erro genérico e o snapshot as-of recém-montado ia
  // junto. Agora a violação é reconhecida e a versão é RENUMERADA, reaproveitando o
  // snapshot já pronto (remontá-lo custaria as mesmas consultas de novo).
  //
  // O teto de tentativas existe para o laço não virar espera indefinida se algo
  // além da versão estiver colidindo — 4 cobre com folga qualquer concorrência real
  // (são poucos operadores clicando num botão semanal).
  const MAX_TENTATIVAS = 4
  let ultimoErro: { message?: string; code?: string } | null = null

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    // ⚠ A leitura da versão vigente FALHA FECHADA — achado da revisão adversarial
    // desta fase. Engolir o erro devolveria `null` (indistinguível de "não há versão
    // nenhuma"), a próxima seria sempre 1, o insert bateria no índice único nas 4
    // tentativas e o operador levaria "Outra pessoa gerou este mesmo período" sobre
    // uma falha de INFRAESTRUTURA. Mentira específica é pior que erro genérico.
    const leitura = await lerUltimaVersao(client, de, ate, filialId)
    if (!leitura.ok) {
      return {
        ok: false,
        erro:
          'Não foi possível conferir qual é a versão atual deste período. Nada foi ' +
          'gravado — tente de novo em instantes.',
      }
    }
    const proxima = (leitura.ultima?.versao ?? 0) + 1

    const { data: inserido, error } = await client
      .from('relatorios_gerados')
      .insert({
        periodo_de: de,
        periodo_ate: ate,
        filial_id: filialId,
        versao: proxima,
        dados: snapshot as unknown as Json,
        gerado_por: aut.uid,
        observacao: obs,
      })
      .select('id')
      .single()

    if (!error && inserido) {
      revalidatePath('/relatorios/gerados')
      return { ok: true, id: inserido.id, versao: proxima }
    }

    ultimoErro = error ?? null
    if (!ehViolacaoDeVersao(error?.code, error?.message)) break
  }

  if (ultimoErro && ehViolacaoDeVersao(ultimoErro.code, ultimoErro.message)) {
    return {
      ok: false,
      erro:
        'Outra pessoa gerou este mesmo período agora há pouco. Abra "Relatórios gerados" ' +
        'para ver a versão mais recente — e gere de novo só se ainda precisar.',
    }
  }
  return { ok: false, erro: traduzErroBanco(ultimoErro?.message, ultimoErro?.code) }
}

// Última versão gravada para (período, filial). `filial_id` null = consolidado, e
// no PostgREST isso é `.is(...)`, não `.eq(...)` — o mesmo par que `queries/gerados.ts`
// usa para achar a versão mais nova de um snapshot aberto.
//
// O retorno DISTINGUE "não há versão" de "não deu para saber": o supabase-js nunca
// rejeita a promise em falha de rede — ele devolve `{ data: null, error }`, e um
// `const { data } = …` transformaria a falha em "período virgem" silenciosamente.
// Quem chama decide o que fazer com cada caso (a geração recusa; o aviso do diálogo
// degrada).
type LeituraVersao =
  | {
      ok: true
      ultima: { versao: number; gerado_em: string; autor: { nome: string | null } | null } | null
    }
  | { ok: false }

async function lerUltimaVersao(
  client: DbClient,
  de: string,
  ate: string,
  filialId: number | null,
): Promise<LeituraVersao> {
  let q = client
    .from('relatorios_gerados')
    .select('versao, gerado_em, autor:profiles!relatorios_gerados_gerado_por_fkey(nome)')
    .eq('periodo_de', de)
    .eq('periodo_ate', ate)
  q = filialId === null ? q.is('filial_id', null) : q.eq('filial_id', filialId)
  const { data, error } = await q
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[relatorios] falha ao ler a versão vigente do período', error)
    return { ok: false }
  }
  return {
    ok: true,
    ultima:
      (data as unknown as {
        versao: number
        gerado_em: string
        autor: { nome: string | null } | null
      } | null) ?? null,
  }
}

// F29/REL-04a — consulta LEVE que responde "este período já tem snapshot?" enquanto
// o dialog está aberto, para o aviso nascer ANTES do clique e não no toast depois.
// Só leitura; o cargo mínimo espelha o de `gerarRelatorio` (é o mesmo botão, o mesmo
// operador) e a resolução de filial é a mesma, para o aviso não falar de outro escopo.
export async function consultarVersaoDoPeriodo(input: {
  filialSlug: string
  de: string
  ate: string
}): Promise<VersaoExistente | null> {
  const parsed = z
    .object({
      filialSlug: z.string().min(1),
      de: dataRealSchema('Data inicial inválida'),
      ate: dataRealSchema('Data final inválida'),
    })
    .safeParse(input)
  if (!parsed.success) return null
  const { filialSlug, de, ate } = parsed.data

  const client = await createClient()
  const aut = await exigirPapel(client, 'operador')
  if (!aut.ok) return null

  const filial =
    filialSlug === 'geral' ? null : await resolverFilialPorSlug(client, filialSlug)
  if (filialSlug !== 'geral' && !filial) return null

  // Aqui a falha de leitura degrada para "não sei" (o `null` do retorno): perder o
  // AVISO não é perder a geração, e um erro que não é do operador atrapalharia mais
  // do que ajuda. O `console.error` de `lerUltimaVersao` deixa o rastro no servidor.
  const leitura = await lerUltimaVersao(client, de, ate, filial?.id ?? null)
  if (!leitura.ok || !leitura.ultima) return null
  return {
    versao: leitura.ultima.versao,
    autorNome: leitura.ultima.autor?.nome ?? null,
    geradoEm: leitura.ultima.gerado_em,
  }
}
