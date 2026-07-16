import type { DbClient } from '@/lib/queries/relatorios'
import type { AnySnapshot } from '@/lib/relatorios/tipos'

// Histórico e leitura dos relatórios GERADOS (snapshots — spec §7.1 / OS-F3 3.8).
// Recebe o client resolvido (operador OU visualizador por senha) — ambos leem.

export type RelatorioGeradoLista = {
  id: string
  periodo_de: string
  periodo_ate: string
  versao: number
  gerado_em: string
  filialNome: string
  filialSlug: string | null
  autorNome: string | null
  temObservacao: boolean // B4 (F6B): indicador discreto na lista
}

type RawLista = {
  id: string
  periodo_de: string
  periodo_ate: string
  versao: number
  gerado_em: string
  observacao: string | null
  filial: { nome: string; slug: string } | null
  autor: { nome: string | null } | null
}

const LISTA_SELECT =
  'id, periodo_de, periodo_ate, versao, gerado_em, observacao, ' +
  'filial:filiais!relatorios_gerados_filial_id_fkey(nome, slug), ' +
  'autor:profiles!relatorios_gerados_gerado_por_fkey(nome)'

export async function listarRelatoriosGerados(
  client: DbClient,
  filialSlug?: string | null,
): Promise<RelatorioGeradoLista[]> {
  let q = client.from('relatorios_gerados').select(LISTA_SELECT)
  if (filialSlug === 'geral') {
    q = q.is('filial_id', null)
  } else if (filialSlug) {
    const { data: f } = await client
      .from('filiais')
      .select('id')
      .eq('slug', filialSlug)
      .maybeSingle()
    if (f) q = q.eq('filial_id', f.id)
  }
  q = q.order('gerado_em', { ascending: false })

  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar relatórios gerados: ${error.message}`)

  return ((data ?? []) as unknown as RawLista[]).map((r) => ({
    id: r.id,
    periodo_de: r.periodo_de,
    periodo_ate: r.periodo_ate,
    versao: r.versao,
    gerado_em: r.gerado_em,
    filialNome: r.filial?.nome ?? 'Consolidado',
    filialSlug: r.filial?.slug ?? null,
    autorNome: r.autor?.nome ?? null,
    temObservacao: !!(r.observacao && r.observacao.trim()),
  }))
}

export type RelatorioGeradoDetalhe = {
  id: string
  periodo_de: string
  periodo_ate: string
  versao: number
  gerado_em: string
  filialId: number | null
  autorNome: string | null
  snapshot: AnySnapshot
  versaoMaisNova: { id: string; versao: number } | null
}

type RawDetalhe = {
  id: string
  periodo_de: string
  periodo_ate: string
  filial_id: number | null
  versao: number
  gerado_em: string
  dados: unknown
  autor: { nome: string | null } | null
}

export async function buscarRelatorioGerado(
  client: DbClient,
  id: string,
): Promise<RelatorioGeradoDetalhe | null> {
  const { data, error } = await client
    .from('relatorios_gerados')
    .select(
      'id, periodo_de, periodo_ate, filial_id, versao, gerado_em, dados, ' +
        'autor:profiles!relatorios_gerados_gerado_por_fkey(nome)',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao abrir o relatório: ${error.message}`)
  if (!data) return null
  const r = data as unknown as RawDetalhe

  // Existe versão mais nova do MESMO (período, filial)? (o fim da errata — 3.8.5)
  let versaoQuery = client
    .from('relatorios_gerados')
    .select('id, versao')
    .eq('periodo_de', r.periodo_de)
    .eq('periodo_ate', r.periodo_ate)
    .gt('versao', r.versao)
  versaoQuery =
    r.filial_id === null
      ? versaoQuery.is('filial_id', null)
      : versaoQuery.eq('filial_id', r.filial_id)
  const { data: novas } = await versaoQuery
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    id: r.id,
    periodo_de: r.periodo_de,
    periodo_ate: r.periodo_ate,
    versao: r.versao,
    gerado_em: r.gerado_em,
    filialId: r.filial_id,
    autorNome: r.autor?.nome ?? null,
    snapshot: r.dados as AnySnapshot,
    versaoMaisNova: novas ? { id: novas.id, versao: novas.versao } : null,
  }
}
