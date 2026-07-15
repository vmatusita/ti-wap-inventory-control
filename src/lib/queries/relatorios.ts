import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseISO,
  format,
  differenceInCalendarDays,
  subDays,
} from 'date-fns'
import type { Database } from '@/lib/types/database'
import type {
  CategoriaAtivo,
  GrupoItem,
  StatusAtivo,
  TermoStatus,
  TipoMovimentacao,
} from '@/lib/dominio'
import { CATEGORIA_ORDEM, STATUS_ORDEM, rotuloTermo } from '@/lib/dominio'
import { dataEmSP, fimDoDiaSP, hojeISO } from '@/lib/format'
import { listarFiliais } from '@/lib/queries/filiais'
import type { Periodo } from '@/lib/relatorios/periodo'
import {
  granularidadeDoPeriodo,
  montarSerieCurta,
  montarSerieMensal,
  type LinhaSerieCurta,
} from '@/lib/relatorios/serie'
import type {
  ChipPendencia,
  ContagemCategoria,
  EstoqueCatStatus,
  GrupoRelatorio,
  ItemModelo,
  ItemReservado,
  KpisRelatorio,
  LinhaEntrada,
  LinhaSaida,
  LinhaTransferencia,
  ManutencaoCaso,
  ModelosPorCategoria,
  MovimentacaoRelatorio,
  PorMotivo,
  ResumoFilial,
  ResumoMotivo,
  ResumoPeriodo,
  ResumoTipo,
  SaldoItemPeriodo,
  SerieMovimentacoes,
  SnapshotRelatorioV2,
} from '@/lib/relatorios/tipos'

// Camada de dados dos relatórios (OS-F3 3.1). TODAS as funções recebem o client
// já resolvido (RLS do operador OU client administrativo p/ sessão por senha —
// lib/auth/acesso.ts) e são parametrizadas por filial e período. `filialId null`
// = consolidado (geral). `getSnapshotRelatorioV2` reúne tudo num objeto JSON
// serializável — é o que a geração de relatório (3.8/3.10) congela. O motor v1
// (grade da F3) foi removido na Fase 3.5: o relatório ao vivo, a geração de
// snapshot e o dashboard consomem uma única implementação por agregação, sobre
// o estado reconstruído (`lerEstadoAtivos`). Ver docs/DECISOES.md.

export type DbClient = SupabaseClient<Database>

export type Filial = { id: number; nome: string; slug: string }

export async function resolverFilialPorSlug(
  client: DbClient,
  slug: string,
): Promise<Filial | null> {
  const { data } = await client
    .from('filiais')
    .select('id, nome, slug')
    .eq('slug', slug)
    .maybeSingle()
  return data ?? null
}

// ---- Helpers compartilhados (modelo, paginação, "última mov por ativo") ----

// Rótulo de modelo a partir de marca+modelo (fonte única das listas do
// relatório). Vazio → "Sem modelo".
function modeloDe(marca: string | null, modelo: string | null): string {
  return [marca, modelo].filter(Boolean).join(' ').trim() || 'Sem modelo'
}

// Paginação única do PostgREST (que corta selects em 1.000 linhas). Uma única
// constante de página e um teto único: o maior domínio hoje é "todos os ativos"
// (~1,2 mil) e "movimentações de um período"; 100 páginas dão ~80× de folga
// sobre o pior caso atual. O teto é só um cinto de segurança contra loop
// infinito — nenhuma consulta real chega perto. (Antes: 4 loops com tetos
// divergentes 20k/50k/100k; unificar em 100k só AMPLIA o menor, nunca trunca o
// que já passava.)
const PAGINA = 1000
const CAP_PAGINACAO = 100_000

async function paginarTodos<Row>(
  rotuloErro: string,
  fazPagina: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const acc: Row[] = []
  for (let from = 0; from < CAP_PAGINACAO; from += PAGINA) {
    const { data, error } = await fazPagina(from, from + PAGINA - 1)
    if (error) throw new Error(`${rotuloErro}: ${error.message}`)
    const rows = (data ?? []) as Row[]
    acc.push(...rows)
    if (rows.length < PAGINA) break
  }
  return acc
}

// "Última movimentação por ativo": reduz linhas JÁ ordenadas (mais recente
// primeiro) a um Map ativo→primeiro valor visto. Fonte única do padrão que se
// repetia para chamado, envio e retorno de manutenção.
function ultimoPorAtivo<T, V>(
  rows: T[],
  ativoDe: (r: T) => string,
  valorDe: (r: T) => V,
): Map<string, V> {
  const out = new Map<string, V>()
  for (const r of rows) {
    const id = ativoDe(r)
    if (!out.has(id)) out.set(id, valorDe(r))
  }
  return out
}

// ---- Série de movimentações adaptativa ao período (OS-F3 melhoria) ----
// A granularidade acompanha a duração do período (dia/semana/mês). Toda a
// matemática de calendário/série vive em lib/relatorios/serie.ts (pura, testada);
// aqui ficam só as leituras do banco, que passam as linhas cruas aos builders.

// Mensal: agregação no banco (rel_mov_por_mes) — uma linha por (mês, tipo).
async function serieMensal(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<SerieMovimentacoes> {
  const { data, error } = await client.rpc('rel_mov_por_mes', {
    p_filial: filialId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  })
  if (error) throw new Error(`Falha nas movimentações por mês: ${error.message}`)
  return montarSerieMensal(data ?? [], periodo)
}

// Dia/semana: baldes calculados a partir das linhas cruas (data, tipo). A janela
// é curta (<=120 dias) → volume limitado; paginado por segurança até o teto único.
async function serieCurta(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
  gran: 'dia' | 'semana',
): Promise<SerieMovimentacoes> {
  const linhas = await paginarTodos<LinhaSerieCurta>(
    'Falha na série de movimentações',
    (from, to) => {
      let q = client
        .from('movimentacoes')
        .select('data, tipo')
        .gte('data', periodo.de)
        .lte('data', periodo.ate)
        .in('tipo', ['saida', 'devolucao'])
      if (filialId) q = q.eq('filial_id', filialId)
      return q
        .order('data', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    },
  )
  return montarSerieCurta(linhas, periodo, gran)
}

export async function getSerieMovimentacoes(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<SerieMovimentacoes> {
  const gran = granularidadeDoPeriodo(periodo)
  return gran === 'mes'
    ? serieMensal(client, filialId, periodo)
    : serieCurta(client, filialId, periodo, gran)
}

export async function getPorMotivo(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<PorMotivo> {
  const { data, error } = await client.rpc('rel_por_motivo', {
    p_filial: filialId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  })
  if (error) throw new Error(`Falha em saídas/devoluções por motivo: ${error.message}`)

  const filtra = (tipo: 'saida' | 'devolucao') =>
    (data ?? [])
      .filter((d) => d.tipo === tipo)
      .map((d) => ({ motivo: d.motivo, total: Number(d.total) }))
      .sort((a, b) => b.total - a.total)

  return { saidas: filtra('saida'), devolucoes: filtra('devolucao') }
}

export async function getResumoPeriodo(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<ResumoPeriodo> {
  const { data, error } = await client.rpc('rel_resumo', {
    p_filial: filialId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  })
  if (error) throw new Error(`Falha ao montar o resumo: ${error.message}`)
  const rows = data ?? []

  function construir(tipo: 'saida' | 'devolucao'): ResumoTipo {
    const porFilial = new Map<string, ResumoFilial>()
    for (const r of rows) {
      if (r.tipo !== tipo) continue
      let f = porFilial.get(r.filial_slug)
      if (!f) {
        f = { filial: r.filial_nome, total: 0, motivos: [] }
        porFilial.set(r.filial_slug, f)
      }
      let m: ResumoMotivo | undefined = f.motivos.find((x) => x.motivo === r.motivo)
      if (!m) {
        m = { motivo: r.motivo, total: 0, categorias: [] }
        f.motivos.push(m)
      }
      const total = Number(r.total)
      m.categorias.push({ categoria: r.categoria, total })
      m.total += total
      f.total += total
    }
    const filiais = [...porFilial.values()].sort((a, b) => b.total - a.total)
    for (const f of filiais) f.motivos.sort((a, b) => b.total - a.total)
    return { total: filiais.reduce((s, f) => s + f.total, 0), filiais }
  }

  return {
    de: periodo.de,
    ate: periodo.ate,
    saidas: construir('saida'),
    devolucoes: construir('devolucao'),
  }
}

// ---- Pendências (contagens agregadas via v_pendencias) ----

type FiltroPendencia = null | 'termo' | 'itens' | 'triagem'

async function contarPendencia(
  client: DbClient,
  filialSlug: string | null,
  filtro: FiltroPendencia,
): Promise<number> {
  let query = client
    .from('v_pendencias')
    .select('*', { count: 'exact', head: true })
  if (filialSlug) query = query.eq('filial', filialSlug)
  if (filtro === 'termo') query = query.eq('pendencia', 'termo pendente')
  else if (filtro === 'itens') query = query.ilike('pendencia', 'itens faltantes%')
  else if (filtro === 'triagem') query = query.eq('pendencia', 'triagem parada')
  const { count, error } = await query
  if (error) throw new Error(`Falha ao contar pendências: ${error.message}`)
  return count ?? 0
}

export async function getPendencias(
  client: DbClient,
  filialSlug: string | null,
): Promise<ChipPendencia[]> {
  const [total, termo, itens, triagem] = await Promise.all([
    contarPendencia(client, filialSlug, null),
    contarPendencia(client, filialSlug, 'termo'),
    contarPendencia(client, filialSlug, 'itens'),
    contarPendencia(client, filialSlug, 'triagem'),
  ])
  const outras = Math.max(0, total - termo - itens - triagem)

  const chips: ChipPendencia[] = [
    { chave: 'termo', rotulo: 'termos de responsabilidade pendentes', total: termo },
    { chave: 'itens', rotulo: 'devoluções com itens faltantes', total: itens },
    { chave: 'triagem', rotulo: 'ativos aguardando triagem', total: triagem },
    { chave: 'outras', rotulo: 'outras pendências', total: outras },
  ]
  return chips.filter((c) => c.total > 0)
}

// ---- Últimas movimentações do período (tabela + CSV) ----

type RawMovRow = {
  id: string
  data: string
  tipo: MovimentacaoRelatorio['tipo']
  chamado: string | null
  observacao: string | null
  colaborador: string | null
  setor: string | null
  ativo: { patrimonio: string; marca: string | null; modelo: string | null; categoria: CategoriaAtivo } | null
  filial: { nome: string } | null
}

const MOV_SELECT =
  'id, data, tipo, chamado, observacao, colaborador, setor, ' +
  'ativo:ativos!movimentacoes_ativo_id_fkey(patrimonio, marca, modelo, categoria), ' +
  'filial:filiais!movimentacoes_filial_id_fkey(nome)'

function mapMovRows(data: unknown): MovimentacaoRelatorio[] {
  const rows = (data ?? []) as RawMovRow[]
  return rows.map((r) => ({
    id: r.id,
    data: r.data,
    tipo: r.tipo,
    patrimonio: r.ativo?.patrimonio ?? '—',
    ativo: r.ativo ? modeloDe(r.ativo.marca, r.ativo.modelo) : '—',
    categoria: r.ativo?.categoria ?? 'outro',
    colaborador_setor: r.colaborador || r.setor || null,
    filial: r.filial?.nome ?? '—',
    chamado: r.chamado,
    observacao: r.observacao,
  }))
}

export async function getUltimasMovimentacoes(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
  limite: number,
): Promise<MovimentacaoRelatorio[]> {
  let q = client
    .from('movimentacoes')
    .select(MOV_SELECT)
    .gte('data', periodo.de)
    .lte('data', periodo.ate)
  if (filialId) q = q.eq('filial_id', filialId)
  q = q
    .order('created_at', { ascending: false })
    .order('data', { ascending: false })
    .order('id', { ascending: false })
    .limit(limite)

  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar movimentações: ${error.message}`)
  return mapMovRows(data)
}

// ===========================================================================
// RELATÓRIO v2 (formato do e-mail — F3B). Estado reconstruído AS-OF no fim do
// período (fast path quando o período termina hoje), 3 grupos, KPIs com Δ e as
// tabelas detalhadas. getSnapshotRelatorioV2 monta o objeto schema 2.
// ===========================================================================

// Estado de um ativo (atual ou as-of). Fonte unificada dos KPIs, categoria×
// status, disponíveis por modelo, reservados e manutenção.
type EstadoAtivo = {
  ativo_id: string
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  filial_id: number
  status: StatusAtivo
  colaborador: string | null
  setor: string | null
}

// Fast path (§7): período terminando hoje → estado derivado atual (barato).
// Período no passado → rel_estoque_asof (reconstrução exata, par mov+estorno se
// anula). `descartado` nunca entra (baixa).
async function lerEstadoAtivos(
  client: DbClient,
  filialId: number | null,
  ate: string,
): Promise<EstadoAtivo[]> {
  if (ate >= hojeISO()) {
    type LinhaAtivo = {
      id: string
      categoria: CategoriaAtivo
      marca: string | null
      modelo: string | null
      filial_id: number
      status: StatusAtivo
      colaborador_atual: string | null
      setor_atual: string | null
    }
    const linhas = await paginarTodos<LinhaAtivo>(
      'Falha ao ler estado atual',
      (from, to) => {
        let q = client
          .from('ativos')
          .select('id, categoria, marca, modelo, filial_id, status, colaborador_atual, setor_atual')
          .neq('status', 'descartado')
        if (filialId) q = q.eq('filial_id', filialId)
        return q.order('id', { ascending: true }).range(from, to)
      },
    )
    return linhas.map((r) => ({
      ativo_id: r.id,
      categoria: r.categoria,
      marca: r.marca,
      modelo: r.modelo,
      filial_id: r.filial_id,
      status: r.status,
      colaborador: r.colaborador_atual,
      setor: r.setor_atual,
    }))
  }

  const { data, error } = await client.rpc('rel_estoque_asof', {
    p_filial: filialId,
    p_data: ate,
  })
  if (error) throw new Error(`Falha ao reconstruir o estoque as-of: ${error.message}`)
  return (data ?? []).map((r) => ({
    ativo_id: r.ativo_id,
    categoria: r.categoria,
    marca: r.marca,
    modelo: r.modelo,
    filial_id: r.filial_id,
    status: r.status,
    colaborador: r.colaborador,
    setor: r.setor,
  }))
}

function kpisDeEstado(estado: EstadoAtivo[]): KpisRelatorio {
  const k: Required<KpisRelatorio> = {
    total: 0,
    em_uso: 0,
    em_estoque: 0,
    reservado: 0,
    em_manutencao: 0,
    em_triagem: 0,
    defasado: 0,
    emprestado: 0,
  }
  for (const a of estado) {
    if (a.status === 'descartado') continue
    k.total++
    if (a.status === 'em_uso') k.em_uso++
    else if (a.status === 'em_estoque') k.em_estoque++
    else if (a.status === 'reservado') k.reservado++
    else if (a.status === 'em_manutencao') k.em_manutencao++
    else if (a.status === 'em_triagem') k.em_triagem++
    else if (a.status === 'defasado') k.defasado++
    else if (a.status === 'emprestado') k.emprestado++
  }
  return k
}

// Dashboard (home): estado atual consolidado. Mesmo motor do relatório v2 — uma
// única implementação de KPI (kpisDeEstado) sobre o estado reconstruído (fast
// path de hoje). O tile do dashboard ignora `emprestado`, então o campo a mais
// não muda a tela. Único caminho do antigo v1 que sobrevive.
export async function getKpis(
  client: DbClient,
  filialId: number | null,
): Promise<KpisRelatorio> {
  return kpisDeEstado(await lerEstadoAtivos(client, filialId, hojeISO()))
}

function categoriaDeEstado(estado: EstadoAtivo[]): ContagemCategoria[] {
  const map = new Map<CategoriaAtivo, number>()
  for (const a of estado) {
    if (a.status === 'descartado') continue
    map.set(a.categoria, (map.get(a.categoria) ?? 0) + 1)
  }
  return CATEGORIA_ORDEM.filter((c) => map.has(c)).map((categoria) => ({
    categoria,
    total: map.get(categoria) ?? 0,
  }))
}

function estoqueCatStatusDeEstado(estado: EstadoAtivo[]): EstoqueCatStatus[] {
  const map = new Map<CategoriaAtivo, Map<StatusAtivo, number>>()
  for (const a of estado) {
    if (a.status === 'descartado') continue
    if (!map.has(a.categoria)) map.set(a.categoria, new Map())
    const m = map.get(a.categoria)!
    m.set(a.status, (m.get(a.status) ?? 0) + 1)
  }
  return CATEGORIA_ORDEM.filter((c) => map.has(c)).map((categoria) => {
    const m = map.get(categoria)!
    const segmentos = STATUS_ORDEM.filter((s) => s !== 'descartado' && m.has(s)).map(
      (status) => ({ status, total: m.get(status) ?? 0 }),
    )
    return { categoria, segmentos, total: segmentos.reduce((s, x) => s + x.total, 0) }
  })
}

function disponiveisPorModeloDeEstado(estado: EstadoAtivo[]): ModelosPorCategoria[] {
  const byCat = new Map<CategoriaAtivo, Map<string, number>>()
  for (const a of estado) {
    if (a.status !== 'em_estoque') continue
    const m = modeloDe(a.marca, a.modelo)
    if (!byCat.has(a.categoria)) byCat.set(a.categoria, new Map())
    const mm = byCat.get(a.categoria)!
    mm.set(m, (mm.get(m) ?? 0) + 1)
  }
  return CATEGORIA_ORDEM.filter((c) => byCat.has(c)).map((categoria) => {
    const mm = byCat.get(categoria)!
    const modelos: ItemModelo[] = [...mm.entries()]
      .map(([modelo, total]) => ({ modelo, total }))
      .sort((a, b) => b.total - a.total || a.modelo.localeCompare(b.modelo, 'pt-BR'))
    return { categoria, modelos, total: modelos.reduce((s, x) => s + x.total, 0) }
  })
}

// Dados estáticos (patrimônio/marca/modelo) de um conjunto pequeno de ativos.
type DadosAtivo = { patrimonio: string; marca: string | null; modelo: string | null; filial_id: number }

async function dadosAtivos(
  client: DbClient,
  ids: string[],
): Promise<Map<string, DadosAtivo>> {
  const out = new Map<string, DadosAtivo>()
  if (ids.length === 0) return out
  const { data, error } = await client
    .from('ativos')
    .select('id, patrimonio, marca, modelo, filial_id')
    .in('id', ids)
  if (error) throw new Error(`Falha ao ler ativos: ${error.message}`)
  for (const r of data ?? [])
    out.set(r.id, { patrimonio: r.patrimonio, marca: r.marca, modelo: r.modelo, filial_id: r.filial_id })
  return out
}

// Último chamado (≤ ate) de cada ativo reservado. As-of correto: só considera
// movimentações até o fim do período.
async function chamadoAteData(
  client: DbClient,
  ids: string[],
  ate: string,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  type LinhaChamado = { ativo_id: string; chamado: string }
  const rows = await paginarTodos<LinhaChamado>(
    'Falha ao ler chamados as-of',
    (from, to) =>
      client
        .from('movimentacoes')
        .select('ativo_id, chamado, created_at')
        .in('ativo_id', ids)
        .not('chamado', 'is', null)
        .lte('data', ate)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
  )
  // Paridade com o motor anterior: chamado '' (string vazia) NÃO reivindica o
  // slot — deixa um chamado real mais antigo vencer. O filtro `.not(is null)` só
  // remove NULL; `movimentacoes.chamado` é `text` sem constraint, então '' é
  // gravável (o seed/app nunca gravam — Zod normaliza ''→null — mas a carga de
  // go-live F4, via CSV fora do Zod, pode).
  return ultimoPorAtivo(
    rows.filter((r) => r.chamado),
    (r) => r.ativo_id,
    (r) => r.chamado,
  )
}

async function reservadosDeEstado(
  client: DbClient,
  estado: EstadoAtivo[],
  ate: string,
): Promise<ItemReservado[]> {
  const reservados = estado.filter((a) => a.status === 'reservado')
  const ids = reservados.map((a) => a.ativo_id)
  const [dados, chamados] = await Promise.all([
    dadosAtivos(client, ids),
    chamadoAteData(client, ids, ate),
  ])
  return reservados
    .map((a) => {
      const d = dados.get(a.ativo_id)
      return {
        patrimonio: d?.patrimonio ?? '—',
        modelo: modeloDe(d?.marca ?? a.marca, d?.modelo ?? a.modelo),
        chamado: chamados.get(a.ativo_id) ?? null,
      }
    })
    .sort((a, b) => a.patrimonio.localeCompare(b.patrimonio, 'pt-BR'))
}

// Manutenção caso a caso, enriquecida (§3.6.3): quem está em manutenção as-of +
// quem VOLTOU no período; envio (data/obs/chamado), dias, anotações do período.
async function manutencaoDeEstado(
  client: DbClient,
  estado: EstadoAtivo[],
  filialId: number | null,
  periodo: Periodo,
  filiaisNome: Map<number, string>,
): Promise<ManutencaoCaso[]> {
  const estadoById = new Map(estado.map((a) => [a.ativo_id, a]))
  const emManutencao = estado.filter((a) => a.status === 'em_manutencao').map((a) => a.ativo_id)

  // Quem voltou de manutenção dentro do período (fechamento do caso).
  let retQ = client
    .from('movimentacoes')
    .select('ativo_id, data, observacao')
    .eq('tipo', 'retorno_manutencao')
    .gte('data', periodo.de)
    .lte('data', periodo.ate)
  if (filialId) retQ = retQ.eq('filial_id', filialId)
  const { data: retornos } = await retQ.order('created_at', { ascending: false })
  const retornoPorAtivo = ultimoPorAtivo(
    retornos ?? [],
    (r) => r.ativo_id,
    (r) => ({ data: r.data, obs: r.observacao }),
  )

  const ids = [...new Set([...emManutencao, ...retornoPorAtivo.keys()])]
  if (ids.length === 0) return []

  const [dados, enviosRaw, anotacoesRaw] = await Promise.all([
    dadosAtivos(client, ids),
    client
      .from('movimentacoes')
      .select('ativo_id, data, observacao, chamado, created_at')
      .in('ativo_id', ids)
      .eq('tipo', 'envio_manutencao')
      .lte('data', periodo.ate)
      .order('created_at', { ascending: false }),
    client
      .from('anotacoes')
      .select('ativo_id, texto, created_at, autor:profiles!anotacoes_criado_por_fkey(nome)')
      .in('ativo_id', ids)
      // Fim do dia `ate` no fuso de São Paulo (UTC-3 fixo), não em UTC — senão as
      // anotações das últimas 3h do dia (21:00–23:59 BRT) cairiam para fora.
      .lte('created_at', fimDoDiaSP(periodo.ate))
      .order('created_at', { ascending: true }),
  ])

  const envioPorAtivo = ultimoPorAtivo(
    enviosRaw.data ?? [],
    (e) => e.ativo_id,
    (e) => ({ data: e.data, obs: e.observacao, chamado: e.chamado }),
  )
  type AnotRow = { ativo_id: string; texto: string; created_at: string; autor: { nome: string | null } | null }
  const anotacoesPorAtivo = new Map<string, { texto: string; autor: string | null; em: string }[]>()
  for (const a of (anotacoesRaw.data ?? []) as unknown as AnotRow[]) {
    const lista = anotacoesPorAtivo.get(a.ativo_id) ?? []
    lista.push({ texto: a.texto, autor: a.autor?.nome ?? null, em: a.created_at })
    anotacoesPorAtivo.set(a.ativo_id, lista)
  }

  const casos: ManutencaoCaso[] = ids.map((id) => {
    const est = estadoById.get(id)
    const d = dados.get(id)
    const envio = envioPorAtivo.get(id) ?? null
    const retorno = retornoPorAtivo.get(id) ?? null
    const fechado = !!retorno
    const fim = retorno ? retorno.data : periodo.ate
    const dias =
      envio?.data != null
        ? Math.max(0, differenceInCalendarDays(parseISO(fim), parseISO(envio.data)))
        : null
    // anotações do episódio (a partir do envio, se houver) — compara a data em
    // SP do created_at (UTC) com envio.data (date de negócio), não o slice UTC.
    const todas = anotacoesPorAtivo.get(id) ?? []
    const anotacoes = envio?.data
      ? todas.filter((n) => dataEmSP(n.em) >= envio.data)
      : todas
    return {
      patrimonio: d?.patrimonio ?? '—',
      modelo: modeloDe(d?.marca ?? est?.marca ?? null, d?.modelo ?? est?.modelo ?? null),
      // filial as-of; se o ativo saiu do estado da filial (transferido/descartado
      // após o retorno no período), cai no filial_id atual (dadosAtivos).
      filial: filiaisNome.get(est?.filial_id ?? d?.filial_id ?? -1) ?? '—',
      chamado: envio?.chamado ?? null,
      dataEnvio: envio?.data ?? null,
      diasEmManutencao: dias,
      obsEnvio: envio?.obs ?? null,
      anotacoes,
      retornoData: retorno?.data ?? null,
      retornoObs: retorno?.obs ?? null,
      fechado,
    }
  })

  // Abertos primeiro (mais dias no topo), fechados depois.
  return casos.sort((a, b) => {
    if (a.fechado !== b.fechado) return a.fechado ? 1 : -1
    return (b.diasEmManutencao ?? 0) - (a.diasEmManutencao ?? 0)
  })
}

// Período anterior de MESMA duração (para o Δ dos KPIs). O comparativo é o
// estado as-of do último dia do período anterior (véspera de `de`).
function periodoAnterior(periodo: Periodo): Periodo {
  const dias = differenceInCalendarDays(parseISO(periodo.ate), parseISO(periodo.de)) + 1
  const ate = format(subDays(parseISO(periodo.de), 1), 'yyyy-MM-dd')
  const de = format(subDays(parseISO(periodo.de), dias), 'yyyy-MM-dd')
  return { de, ate }
}

// Grupos 2–3: saldo as-of + movimentação no período + frescor + última obs.
async function getGruposItens(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<GrupoRelatorio[]> {
  const [saldos, movs, frescor, obsRows] = await Promise.all([
    client.rpc('rel_saldo_itens', { p_filial: filialId, p_ate: periodo.ate }),
    client.rpc('rel_mov_itens', { p_filial: filialId, p_de: periodo.de, p_ate: periodo.ate }),
    client.rpc('rel_frescor_itens', { p_filial: filialId, p_ate: periodo.ate }),
    (() => {
      let q = client
        .from('lancamentos_item')
        .select('item_id, observacao, data, created_at')
        .not('observacao', 'is', null)
        .gte('data', periodo.de)
        .lte('data', periodo.ate)
      if (filialId) q = q.eq('filial_id', filialId)
      return q.order('created_at', { ascending: false }).limit(1000)
    })(),
  ])
  if (saldos.error) throw new Error(`Falha nos saldos de itens: ${saldos.error.message}`)
  if (movs.error) throw new Error(`Falha na movimentação de itens: ${movs.error.message}`)

  const movPorItem = new Map<number, { entradas: number; saidas: number }>()
  for (const m of movs.data ?? []) {
    movPorItem.set(m.item_id, { entradas: Number(m.entradas), saidas: Number(m.saidas) })
  }
  const obsPorItem = new Map<number, string>()
  for (const o of obsRows.data ?? []) {
    if (o.observacao && !obsPorItem.has(o.item_id)) obsPorItem.set(o.item_id, o.observacao)
  }
  const frescorPorGrupo = new Map<GrupoItem, string | null>()
  for (const f of frescor.data ?? []) frescorPorGrupo.set(f.grupo, f.ultima)

  const porGrupo = new Map<GrupoItem, SaldoItemPeriodo[]>()
  for (const s of saldos.data ?? []) {
    const mov = movPorItem.get(s.item_id) ?? { entradas: 0, saidas: 0 }
    const saldo = Number(s.saldo)
    const atrelados = Number(s.atrelados)
    const falta = Number(s.falta)
    // Esconde itens sem nenhum sinal no filtro (saldo/atrelados/mov/falta zerados).
    if (saldo === 0 && atrelados === 0 && falta === 0 && mov.entradas === 0 && mov.saidas === 0) {
      continue
    }
    const linha: SaldoItemPeriodo = {
      item: s.item,
      saldo,
      atrelados,
      falta,
      entradas: mov.entradas,
      saidas: mov.saidas,
      delta: mov.entradas - mov.saidas,
      obs: obsPorItem.get(s.item_id) ?? null,
    }
    const lista = porGrupo.get(s.grupo) ?? []
    lista.push(linha)
    porGrupo.set(s.grupo, lista)
  }

  const grupos: GrupoRelatorio[] = []
  for (const grupo of ['acessorio', 'componente'] as GrupoItem[]) {
    const itens = porGrupo.get(grupo) ?? []
    grupos.push({
      grupo,
      itens,
      ultimoLancamento: frescorPorGrupo.get(grupo) ?? null,
      temAtrelados: itens.some((i) => i.atrelados > 0),
    })
  }
  return grupos
}

// Tabelas detalhadas do período (§4.4). Paginadas com desempate por id.
type RawTabelaRow = {
  id: string
  data: string
  tipo: TipoMovimentacao
  chamado: string | null
  observacao: string | null
  colaborador: string | null
  setor: string | null
  motivo: string | null
  termo_assinado: TermoStatus | null
  itens_faltantes: string[] | null
  ativo: { patrimonio: string; marca: string | null; modelo: string | null; categoria: CategoriaAtivo } | null
  filial: { nome: string } | null
  destino: { nome: string } | null
  motivoRotulo: { rotulo: string } | null
}

const TAB_SELECT =
  'id, data, tipo, chamado, observacao, colaborador, setor, motivo, termo_assinado, itens_faltantes, ' +
  'ativo:ativos!movimentacoes_ativo_id_fkey(patrimonio, marca, modelo, categoria), ' +
  'filial:filiais!movimentacoes_filial_id_fkey(nome), ' +
  'destino:filiais!movimentacoes_filial_destino_id_fkey(nome), ' +
  'motivoRotulo:motivos!movimentacoes_motivo_fkey(rotulo)'

async function buscarLinhasPeriodo(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
  tipos: TipoMovimentacao[],
  incluirDestino = false,
): Promise<RawTabelaRow[]> {
  return paginarTodos<RawTabelaRow>(
    'Falha ao montar tabela do período',
    (from, to) => {
      let q = client
        .from('movimentacoes')
        .select(TAB_SELECT)
        .in('tipo', tipos)
        .gte('data', periodo.de)
        .lte('data', periodo.ate)
      if (filialId) {
        // Transferência aparece nas DUAS filiais (regra 5): origem OU destino.
        q = incluirDestino
          ? q.or(`filial_id.eq.${filialId},filial_destino_id.eq.${filialId}`)
          : q.eq('filial_id', filialId)
      }
      return q
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    },
  )
}

async function getTabelasFinais(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<{ saidas: LinhaSaida[]; entradas: LinhaEntrada[]; transferencias: LinhaTransferencia[] }> {
  const [saidasRaw, entradasRaw, transfRaw] = await Promise.all([
    buscarLinhasPeriodo(client, filialId, periodo, ['saida', 'emprestimo']),
    buscarLinhasPeriodo(client, filialId, periodo, ['devolucao', 'compra']),
    buscarLinhasPeriodo(client, filialId, periodo, ['transferencia'], true),
  ])

  const modeloRow = (r: RawTabelaRow) =>
    r.ativo ? modeloDe(r.ativo.marca, r.ativo.modelo) : '—'

  const saidas: LinhaSaida[] = saidasRaw.map((r) => ({
    id: r.id,
    data: r.data,
    filial: r.filial?.nome ?? '—',
    categoria: r.ativo?.categoria ?? 'outro',
    modelo: modeloRow(r),
    patrimonio: r.ativo?.patrimonio ?? '—',
    tipo: r.tipo,
    motivo: r.motivoRotulo?.rotulo ?? r.motivo,
    chamado: r.chamado,
    colaboradorSetor: r.colaborador || r.setor || null,
    termo: r.termo_assinado ? rotuloTermo(r.termo_assinado) : null,
    obs: r.observacao,
  }))

  const entradas: LinhaEntrada[] = entradasRaw.map((r) => ({
    id: r.id,
    data: r.data,
    filial: r.filial?.nome ?? '—',
    categoria: r.ativo?.categoria ?? 'outro',
    modelo: modeloRow(r),
    patrimonio: r.ativo?.patrimonio ?? '—',
    tipo: r.tipo,
    motivo: r.motivoRotulo?.rotulo ?? r.motivo,
    colaborador: r.colaborador,
    setor: r.setor,
    itensFaltantes: r.itens_faltantes,
    obs: r.observacao,
  }))

  const transferencias: LinhaTransferencia[] = transfRaw.map((r) => ({
    id: r.id,
    data: r.data,
    de: r.filial?.nome ?? '—',
    para: r.destino?.nome ?? '—',
    categoria: r.ativo?.categoria ?? 'outro',
    modelo: modeloRow(r),
    patrimonio: r.ativo?.patrimonio ?? '—',
    chamado: r.chamado,
    obs: r.observacao,
  }))

  return { saidas, entradas, transferencias }
}

// Monta o SnapshotRelatorio schema 2 (serializável, congelável).
export async function getSnapshotRelatorioV2(
  client: DbClient,
  filialSlug: string,
  periodo: Periodo & { rotulo?: string },
): Promise<SnapshotRelatorioV2> {
  const ehGeral = filialSlug === 'geral'
  const filial = ehGeral ? null : await resolverFilialPorSlug(client, filialSlug)
  if (!ehGeral && !filial) throw new Error(`Filial "${filialSlug}" não encontrada`)
  const filialId = filial?.id ?? null
  const slugParaView = ehGeral ? null : filialSlug
  const anterior = periodoAnterior(periodo)

  const filiais = await listarFiliais(client)
  const filiaisNome = new Map(filiais.map((f) => [f.id, f.nome]))

  const [estado, estadoAnt, serie, porMotivo, pendencias, grupos, tabelas, resumo] =
    await Promise.all([
      lerEstadoAtivos(client, filialId, periodo.ate),
      lerEstadoAtivos(client, filialId, anterior.ate),
      getSerieMovimentacoes(client, filialId, periodo),
      getPorMotivo(client, filialId, periodo),
      getPendencias(client, slugParaView),
      getGruposItens(client, filialId, periodo),
      getTabelasFinais(client, filialId, periodo),
      getResumoPeriodo(client, filialId, periodo),
    ])

  const [reservados, manutencao] = await Promise.all([
    reservadosDeEstado(client, estado, periodo.ate),
    manutencaoDeEstado(client, estado, filialId, periodo, filiaisNome),
  ])

  return {
    meta: {
      filialSlug,
      filialNome: filial?.nome ?? 'Consolidado',
      ehGeral,
      de: periodo.de,
      ate: periodo.ate,
      periodoRotulo: periodo.rotulo ?? '',
      schema: 2,
    },
    kpis: kpisDeEstado(estado),
    kpisAnterior: kpisDeEstado(estadoAnt),
    estoquePorCategoria: categoriaDeEstado(estado),
    estoqueCatStatus: estoqueCatStatusDeEstado(estado),
    disponiveisPorModelo: disponiveisPorModeloDeEstado(estado),
    reservados,
    manutencao,
    serieMovimentacoes: serie,
    porMotivo,
    grupos,
    pendencias,
    saidas: tabelas.saidas,
    entradas: tabelas.entradas,
    transferencias: tabelas.transferencias,
    resumo,
  }
}
