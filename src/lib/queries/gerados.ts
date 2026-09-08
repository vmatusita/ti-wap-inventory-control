import 'server-only'
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
  // F29/REL-05b: existe versão MAIOR do mesmo (período, escopo). Antes, uma v1
  // superada era indistinguível da vigente na lista — o aviso só aparecia depois
  // de abrir, e quem imprimisse da lista imprimiria a errata.
  superada: boolean
}

// F29/REL-05a — a lista trazia TUDO (~6 snapshots/semana passam de 300 linhas/ano).
// 30 é o mesmo tamanho fixo de `/movimentacoes` (MOV_PAGE_SIZE); a página de ajuda
// lê esta constante, então mudar o número aqui muda a documentação no mesmo build.
export const GERADOS_PAGE_SIZE = 30

export type PaginaRelatoriosGerados = {
  linhas: RelatorioGeradoLista[]
  total: number
  page: number
  pageSize: number
}

type RawLista = {
  id: string
  periodo_de: string
  periodo_ate: string
  filial_id: number | null
  versao: number
  gerado_em: string
  observacao: string | null
  filial: { nome: string; slug: string } | null
  autor: { nome: string | null } | null
}

const LISTA_SELECT =
  'id, periodo_de, periodo_ate, filial_id, versao, gerado_em, observacao, ' +
  'filial:filiais!relatorios_gerados_filial_id_fkey(nome, slug), ' +
  'autor:profiles!relatorios_gerados_gerado_por_fkey(nome)'

// Chave da unicidade de versão no banco (`unique (periodo_de, periodo_ate, filial_id,
// versao)` — 0010/0013): é por ela que se sabe qual snapshot superou qual.
function chaveVersao(periodoDe: string, periodoAte: string, filialId: number | null): string {
  return `${periodoDe}|${periodoAte}|${filialId ?? 'geral'}`
}

// O slug reservado do relatório CONSOLIDADO: no banco ele é `filial_id is null`,
// e não uma linha de `filiais`.
const SLUG_CONSOLIDADO = 'geral'

// Faixa pedida além do fim do resultado: o PostgREST responde 416 com este código em vez de
// uma lista vazia. Mesmo tratamento das outras listas paginadas (ativos, movimentacoes,
// itens, pendencias-detalhe, eventos-admin, conflitos).
const RANGE_INVALIDO = 'PGRST103'

export async function listarRelatoriosGerados(
  client: DbClient,
  // F25 — multi-seleção. `[]` = sem recorte (todas). Pode conter `'geral'`
  // misturado com slugs de filial.
  filialSlugs: readonly string[] = [],
  // F29/REL-05a — paginação. Ausente = página 1 no tamanho padrão.
  opcoes: { page?: number; pageSize?: number } = {},
): Promise<PaginaRelatoriosGerados> {
  const pageSize = Math.max(1, opcoes.pageSize ?? GERADOS_PAGE_SIZE)
  const page = Math.max(1, opcoes.page ?? 1)

  // Recorte de filial resolvido UMA vez; a query é REMONTADA a cada tentativa (a faixa
  // inválida é refeita numa página menor, abaixo).
  let filtroFilial: { consolidado: boolean; ids: number[] } | null = null

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
      if (ids.length === 0 && !querConsolidado) {
        return { linhas: [], total: 0, page, pageSize }
      }
    }

    filtroFilial = { consolidado: querConsolidado, ids }
  }

  // A consulta com os filtros aplicados. Função (e não um builder guardado) porque um
  // builder do supabase-js só pode ser executado uma vez, e o fallback de faixa inválida
  // precisa refazê-la.
  const consulta = (head = false) => {
    let q = client
      .from('relatorios_gerados')
      .select(LISTA_SELECT, { count: 'exact', head })
    if (filtroFilial) {
      const { consolidado, ids } = filtroFilial
      // ⚠ `.is('filial_id', null)` e `.in('filial_id', […])` na MESMA coluna se
      // combinam com AND e devolveriam ZERO linhas em silêncio. Pedir o Consolidado
      // junto com filiais é um OR, e o PostgREST só o expressa por `.or(...)`.
      if (consolidado && ids.length > 0) {
        q = q.or(`filial_id.is.null,filial_id.in.(${ids.join(',')})`)
      } else if (consolidado) {
        q = q.is('filial_id', null)
      } else {
        q = q.in('filial_id', ids)
      }
    }
    // `id` desempata: `gerado_em` empata quando os snapshots das filiais são gerados em
    // sequência, e sem ordem TOTAL a mesma linha pode aparecer em duas páginas (ou sumir
    // entre elas). Mesma disciplina de `listarEventosAdmin` e `listarConflitos`.
    return q.order('gerado_em', { ascending: false }).order('id', { ascending: false })
  }

  const faixa = (p: number) =>
    consulta().range((p - 1) * pageSize, (p - 1) * pageSize + pageSize - 1)

  let pageAtual = page
  let { data, error, count } = await faixa(pageAtual)

  // `?page=4` (link salvo, filtro que encolheu o resultado) não pode derrubar o Server
  // Component: o PostgREST responde 416/PGRST103 em vez de lista vazia. Descobre o total e
  // mostra a ÚLTIMA página que existe. Uma tentativa, sem laço — mesma rede das outras seis
  // listas paginadas. Aqui isso vale dobrado: esta tela também é servida ao visualizador
  // por senha, que não tem sidebar nem paleta para escapar de um error boundary.
  if (error?.code === RANGE_INVALIDO) {
    const { count: total, error: erroTotal } = await consulta(true)
    if (erroTotal)
      throw new Error(`Falha ao listar relatórios gerados: ${erroTotal.message}`)
    pageAtual = Math.max(1, Math.ceil((total ?? 0) / pageSize))
    ;({ data, error, count } = await faixa(pageAtual))
  }

  if (error) throw new Error(`Falha ao listar relatórios gerados: ${error.message}`)
  const rows = (data ?? []) as unknown as RawLista[]

  // F29/REL-05b — a badge "superada" é EXATA, não uma aproximação sobre a página.
  // Com paginação, calcular o máximo só entre as linhas carregadas erraria toda vez
  // que a v1 e a v2 caíssem em páginas diferentes — e errar para MENOS é o pior lado
  // (a lista afirmaria vigência de um snapshot já superado). Uma consulta extra,
  // recortada pelas datas DESTA página e com quatro colunas, resolve: a chave da
  // unicidade começa por `periodo_de`, então nenhuma versão do mesmo período escapa
  // do `.in(...)`. Página vazia não consulta nada.
  const maxPorChave = new Map<string, number>()
  const datas = [...new Set(rows.map((r) => r.periodo_de))]
  if (datas.length > 0) {
    const { data: versoes, error: eVersoes } = await client
      .from('relatorios_gerados')
      .select('periodo_de, periodo_ate, filial_id, versao')
      .in('periodo_de', datas)
    // Falhar aqui só custa a badge — a lista continua de pé, sem afirmar vigência
    // que não pôde conferir (o `Map` vazio faz `superada` ser false em todas).
    if (eVersoes) {
      console.error('[gerados] falha ao conferir versões superadas', eVersoes)
    } else {
      for (const v of versoes ?? []) {
        const k = chaveVersao(v.periodo_de, v.periodo_ate, v.filial_id)
        maxPorChave.set(k, Math.max(maxPorChave.get(k) ?? 0, v.versao))
      }
    }
  }

  const linhas = rows.map((r) => ({
    id: r.id,
    periodo_de: r.periodo_de,
    periodo_ate: r.periodo_ate,
    versao: r.versao,
    gerado_em: r.gerado_em,
    filialNome: r.filial?.nome ?? 'Consolidado',
    filialSlug: r.filial?.slug ?? null,
    autorNome: r.autor?.nome ?? null,
    temObservacao: !!(r.observacao && r.observacao.trim()),
    superada:
      (maxPorChave.get(chaveVersao(r.periodo_de, r.periodo_ate, r.filial_id)) ?? r.versao) >
      r.versao,
  }))

  // `pageAtual` e não `page`: quando a faixa recuou, o rodapé precisa mostrar a página que
  // realmente foi servida — senão os botões Anterior/Próxima navegam a partir de um número
  // que não corresponde às linhas na tela.
  return { linhas, total: count ?? linhas.length, page: pageAtual, pageSize }
}

// F29/REL-05c — o snapshot aberto era um beco: só "← Relatórios gerados". Estes são
// os vizinhos do MESMO escopo (mesma filial, ou consolidado), pelo período — não pela
// versão: "anterior" é o snapshot da semana passada daquela filial, e não a v1 deste
// mesmo período. Entre versões do mesmo período vale a mais nova (o banner de errata
// já cuida da comparação de versões).
export type VizinhoRelatorio = { id: string; periodo_de: string; periodo_ate: string }

export async function vizinhosDoRelatorio(
  client: DbClient,
  alvo: { filialId: number | null; periodoDe: string },
): Promise<{ anterior: VizinhoRelatorio | null; proximo: VizinhoRelatorio | null }> {
  function base() {
    const q = client
      .from('relatorios_gerados')
      .select('id, periodo_de, periodo_ate, versao')
    return alvo.filialId === null ? q.is('filial_id', null) : q.eq('filial_id', alvo.filialId)
  }

  const [ant, prox] = await Promise.all([
    base()
      .lt('periodo_de', alvo.periodoDe)
      .order('periodo_de', { ascending: false })
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle(),
    base()
      .gt('periodo_de', alvo.periodoDe)
      .order('periodo_de', { ascending: true })
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Falha de leitura aqui tira a NAVEGAÇÃO, não o relatório: degrada para "não há
  // vizinho" em vez de derrubar a página inteira do snapshot congelado.
  if (ant.error) console.error('[gerados] falha ao buscar o período anterior', ant.error)
  if (prox.error) console.error('[gerados] falha ao buscar o próximo período', prox.error)

  const limpar = (v: typeof ant.data): VizinhoRelatorio | null =>
    v ? { id: v.id, periodo_de: v.periodo_de, periodo_ate: v.periodo_ate } : null

  return { anterior: limpar(ant.data), proximo: limpar(prox.data) }
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
