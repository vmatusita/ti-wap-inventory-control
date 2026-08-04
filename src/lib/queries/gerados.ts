import type { DbClient } from '@/lib/queries/relatorios'
import type { AnySnapshot } from '@/lib/relatorios/tipos'
import { ehUuid } from '@/lib/url-params'

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

// O slug reservado do relatório CONSOLIDADO: no banco ele é `filial_id is null`,
// e não uma linha de `filiais`.
const SLUG_CONSOLIDADO = 'geral'

export async function listarRelatoriosGerados(
  client: DbClient,
  // F25 — multi-seleção. `[]` = sem recorte (todas). Pode conter `'geral'`
  // misturado com slugs de filial.
  filialSlugs: readonly string[] = [],
): Promise<RelatorioGeradoLista[]> {
  let q = client.from('relatorios_gerados').select(LISTA_SELECT)

  if (filialSlugs.length > 0) {
    const querConsolidado = filialSlugs.includes(SLUG_CONSOLIDADO)
    const slugsDeFilial = filialSlugs.filter((s) => s !== SLUG_CONSOLIDADO)

    let ids: number[] = []
    if (slugsDeFilial.length > 0) {
      const { data: fs, error: eFilial } = await client
        .from('filiais')
        .select('id')
        .in('slug', slugsDeFilial)
      if (eFilial)
        throw new Error(`Falha ao resolver a filial do filtro: ${eFilial.message}`)
      ids = (fs ?? []).map((f) => f.id)
      // Filtro que não pôde ser resolvido tem de devolver VAZIO, nunca o conjunto
      // completo: antes, um slug inexistente (favorito de filial renomeada, URL
      // digitada à mão) simplesmente pulava o `.eq()` e a tela listava os snapshots
      // de TODAS as filiais — com o seletor mostrando só o placeholder, ou seja, sem
      // nada que denunciasse que o filtro tinha sido ignorado.
      //
      // F25 mantém a regra e a estreita: NENHUM dos slugs pedidos resolveu e o
      // consolidado não foi pedido ⇒ vazio.
      if (ids.length === 0 && !querConsolidado) return []
    }

    // ⚠ `.is('filial_id', null)` e `.in('filial_id', […])` na MESMA coluna se
    // combinam com AND e devolveriam ZERO linhas em silêncio. Pedir o Consolidado
    // junto com filiais é um OR, e o PostgREST só o expressa por `.or(...)`.
    if (querConsolidado && ids.length > 0) {
      q = q.or(`filial_id.is.null,filial_id.in.(${ids.join(',')})`)
    } else if (querConsolidado) {
      q = q.is('filial_id', null)
    } else {
      q = q.in('filial_id', ids)
    }
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
  // `id` vem cru do path (`/relatorios/gerados/[id]`). Sem esta guarda um valor
  // fora do formato uuid vira 22P02 no PostgREST, a função LANÇA e a rota cai no
  // error boundary genérico — quando o certo é o mesmo 404 que um uuid válido
  // inexistente já recebe (`notFound()` na página). `null` = não existe.
  if (!ehUuid(id)) return null

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
  const { data: novas, error: eVersao } = await versaoQuery
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()
  // Falhar aqui em silêncio some com o aviso de errata e deixa no ar só o selo
  // "dados congelados" — o leitor imprime/decide por um snapshot já superado
  // achando que é o vigente. As duas leituras vizinhas deste arquivo propagam.
  if (eVersao)
    throw new Error(`Falha ao conferir versões do relatório: ${eVersao.message}`)

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
