import 'server-only'
import type { DbClient } from '@/lib/queries/relatorios'
import type { AnySnapshot } from '@/lib/relatorios/tipos'
import { ehUuid } from '@/lib/url-params'
import { registrarFalha } from '@/lib/observabilidade'
import { lerUnidades, type UnidadesEfetivas } from '@/lib/auth/recorte-leitura'
// A chave da unicidade de versão mora no módulo puro desde a F57, travada contra o SQL
// (`relatorios/chave-versao-sql.test.ts`).
import { chaveVersao } from '@/lib/relatorios/versao-snapshot'
import { linhaDe, linhasDe } from '@/lib/supabase/linhas'
import {
  LEITURA_DETALHE_RELATORIO_GERADO,
  LEITURA_LISTA_RELATORIOS_GERADOS,
} from '@/lib/queries/formas/relatorios-gerados'

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

// Faixa pedida além do fim do resultado: o PostgREST responde 416 com este código em vez de
// uma lista vazia. Mesmo tratamento das outras listas paginadas (ativos, movimentacoes,
// itens, pendencias-detalhe, eventos-admin, conflitos).
const RANGE_INVALIDO = 'PGRST103'

export async function listarRelatoriosGerados(
  client: DbClient,
  // F25 — multi-seleção, podendo pedir o Consolidado junto com filiais. F57 — chega como
  // `UnidadesEfetivas` por slug, e o Consolidado (`filial_id is null`) é o TERCEIRO VALOR da
  // vista: `incluiSemUnidade` numa lista, ou o modo `somente-sem-unidade` sozinho. Obrigatório:
  // o "sem recorte" é o modo `todas`, com nome.
  unidades: UnidadesEfetivas<'slug'>,
  // F29/REL-05a — paginação. Ausente = página 1 no tamanho padrão.
  opcoes: { page?: number; pageSize?: number } = {},
): Promise<PaginaRelatoriosGerados> {
  const pageSize = Math.max(1, opcoes.pageSize ?? GERADOS_PAGE_SIZE)
  const page = Math.max(1, opcoes.page ?? 1)

  // Recorte de filial resolvido UMA vez; a query é REMONTADA a cada tentativa (a faixa
  // inválida é refeita numa página menor, abaixo).
  let filtroFilial: { consolidado: boolean; ids: number[] } | null = null

  const vista = lerUnidades(unidades)
  // Interseção vazia: nada a listar, e nenhuma consulta a fazer.
  if (vista.modo === 'nenhuma') return { linhas: [], total: 0, page, pageSize }

  if (vista.modo !== 'todas') {
    const querConsolidado = vista.modo === 'somente-sem-unidade' || vista.incluiSemUnidade
    // Os slugs de FILIAL pedidos (sem o Consolidado, que já veio no flag). Vazio só quando o
    // pedido é SÓ o Consolidado — e aí o filtro abaixo vira `filial_id is null`.
    const slugsDeFilial: readonly string[] = vista.modo === 'lista' ? vista.valores : []

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
      .select(LEITURA_LISTA_RELATORIOS_GERADOS.select, { count: 'exact', head })
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
  const rows = linhasDe(data, LEITURA_LISTA_RELATORIOS_GERADOS.forma, LEITURA_LISTA_RELATORIOS_GERADOS.rotulo)

  // F29/REL-05b — a badge "superada" é EXATA, não uma aproximação sobre a página.
  // Com paginação, calcular o máximo só entre as linhas carregadas erraria toda vez
  // que a v1 e a v2 caíssem em páginas diferentes — e errar para MENOS é o pior lado
  // (a lista afirmaria vigência de um snapshot já superado). Uma consulta extra,
  // recortada pelas datas DESTA página e com quatro colunas, resolve: a chave da
  // unicidade começa por `periodo_de`, então nenhuma versão do mesmo período escapa
  // do `.in(...)`. Página vazia não consulta nada.
  const maxPorChave = new Map<string, number>()
  // F65 — a chave da versão é POR EMPRESA (o índice da 0171): a empresa de cada linha da página sai
  // desta mesma consulta, pelo `id` (toda linha da página está no `.in('periodo_de', datas)` por
  // construção). A forma da lista (`formas/relatorios-gerados.ts`) não muda.
  const empresaPorId = new Map<string, string>()
  const datas = [...new Set(rows.map((r) => r.periodo_de))]
  if (datas.length > 0) {
    // ⚠ A PRIMEIRA LEITURA TS DE `empresa_id` ANTES DA F66 — identidade da CHAVE do snapshot, não
    // recorte: a consulta continua sem filtro de empresa. É exceção NOMINAL da trava "ninguém lê"
    // (`src/lib/validators/empresa-acervo-sem-leitura.test.ts`), por este trecho.
    const { data: versoes, error: eVersoes } = await client
      .from('relatorios_gerados')
      .select('id, empresa_id, periodo_de, periodo_ate, filial_id, versao')
      .in('periodo_de', datas)
    // Falhar aqui só custa a badge — a lista continua de pé, sem afirmar vigência
    // que não pôde conferir (o `Map` vazio faz `superada` ser false em todas).
    if (eVersoes) {
      registrarFalha({ escopo: 'gerados.versoes-superadas', erro: eVersoes })
    } else {
      for (const v of versoes ?? []) {
        const empresa = v.empresa_id
        empresaPorId.set(v.id, empresa)
        const k = chaveVersao(empresa, v.periodo_de, v.periodo_ate, v.filial_id)
        maxPorChave.set(k, Math.max(maxPorChave.get(k) ?? 0, v.versao))
      }
    }
  }
  // Sem a empresa da linha (a consulta das versões falhou), a chave não casa nada e `superada` é
  // false — a mesma degradação de antes: a lista não afirma o que não conferiu.
  const chaveDaLinha = (r: (typeof rows)[number]) => {
    const empresa = empresaPorId.get(r.id)
    return empresa === undefined ? null : chaveVersao(empresa, r.periodo_de, r.periodo_ate, r.filial_id)
  }

  const linhas = rows.map((r) => ({
    id: r.id,
    periodo_de: r.periodo_de,
    periodo_ate: r.periodo_ate,
    versao: r.versao,
    gerado_em: r.gerado_em,
    filialNome: r.filial?.nome ?? 'Consolidado',
    filialSlug: r.filial?.slug ?? null,
    autorNome: r.autor.nome,
    temObservacao: !!(r.observacao && r.observacao.trim()),
    superada: (() => {
      const k = chaveDaLinha(r)
      return k !== null && (maxPorChave.get(k) ?? r.versao) > r.versao
    })(),
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
  if (ant.error) registrarFalha({ escopo: 'gerados.periodo-anterior', erro: ant.error })
  if (prox.error) registrarFalha({ escopo: 'gerados.periodo-proximo', erro: prox.error })

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
    .select(LEITURA_DETALHE_RELATORIO_GERADO.select)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao abrir o relatório: ${error.message}`)
  const r = linhaDe(data, LEITURA_DETALHE_RELATORIO_GERADO.forma, LEITURA_DETALHE_RELATORIO_GERADO.rotulo)
  if (!r) return null

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
    autorNome: r.autor.nome,
    snapshot: r.dados,
    versaoMaisNova: novas ? { id: novas.id, versao: novas.versao } : null,
  }
}
