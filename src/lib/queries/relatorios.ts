import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseISO,
  format,
  differenceInCalendarDays,
  startOfWeek,
  addDays,
  addWeeks,
  subDays,
} from 'date-fns'
import type { Database } from '@/lib/types/database'
import type {
  CategoriaAtivo,
  GrupoItem,
  StatusAtivo,
  TipoMovimentacao,
} from '@/lib/dominio'
import { CATEGORIA_ORDEM, STATUS_ORDEM, rotuloTermo } from '@/lib/dominio'
import { dataEmSP, hojeISO } from '@/lib/format'
import { listarFiliais } from '@/lib/queries/filiais'
import type { Periodo } from '@/lib/relatorios/periodo'
import type {
  ChipPendencia,
  ContagemCategoria,
  EstoqueCatStatus,
  GranularidadeSerie,
  GrupoRelatorio,
  ItemManutencao,
  ItemModelo,
  ItemReservado,
  KpisRelatorio,
  LinhaEntrada,
  LinhaSaida,
  LinhaTransferencia,
  ManutencaoCaso,
  ModelosPorCategoria,
  MovimentacaoRelatorio,
  PontoSerie,
  PorMotivo,
  ResumoFilial,
  ResumoMotivo,
  ResumoPeriodo,
  ResumoTipo,
  SaldoItemPeriodo,
  SerieMovimentacoes,
  SnapshotRelatorio,
  SnapshotRelatorioV2,
} from '@/lib/relatorios/tipos'

// Camada de dados dos relatórios (OS-F3 3.1). TODAS as funções recebem o client
// já resolvido (RLS do operador OU client administrativo p/ sessão por senha —
// lib/auth/acesso.ts) e são parametrizadas por filial e período. `filialId null`
// = consolidado (geral). `getSnapshotRelatorio` reúne tudo num objeto JSON
// serializável — é o que a geração de relatório (3.8) congela.

export type DbClient = SupabaseClient<Database>

// Movimentações capturadas no snapshot (frozen) — o suficiente p/ um relatório
// da semana + CSV offline. A página ao vivo mostra menos e exporta o período
// inteiro por Server Action (OS-F3 3.5.1).
const CAP_MOV_SNAPSHOT = 1000
const CAP_MOV_AO_VIVO = 200

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

// ---- KPIs e categoria (estado ATUAL, via view agregada v_estoque_atual) ----

type LinhaEstoque = {
  categoria: CategoriaAtivo | null
  status: StatusAtivo | null
  total: number | null
}

async function lerEstoqueAtual(
  client: DbClient,
  filialSlug: string | null,
): Promise<LinhaEstoque[]> {
  let q = client.from('v_estoque_atual').select('categoria, status, total')
  if (filialSlug) q = q.eq('filial', filialSlug)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao ler o estoque: ${error.message}`)
  return (data ?? []) as LinhaEstoque[]
}

// Buckets de KPI que ganham tile próprio (spec §7 / mockup). `emprestado` conta
// no total mas não tem tile; `descartado` (baixa definitiva) não entra no total.
const KPI_BUCKETS: Partial<Record<StatusAtivo, keyof KpisRelatorio>> = {
  em_uso: 'em_uso',
  em_estoque: 'em_estoque',
  reservado: 'reservado',
  em_manutencao: 'em_manutencao',
  em_triagem: 'em_triagem',
  defasado: 'defasado',
}

function kpisDeEstoque(linhas: LinhaEstoque[]): KpisRelatorio {
  const kpis: KpisRelatorio = {
    total: 0,
    em_uso: 0,
    em_estoque: 0,
    reservado: 0,
    em_manutencao: 0,
    em_triagem: 0,
    defasado: 0,
  }
  for (const l of linhas) {
    if (!l.status || l.status === 'descartado') continue
    const n = l.total ?? 0
    kpis.total += n
    const bucket = KPI_BUCKETS[l.status]
    if (bucket) kpis[bucket] += n
  }
  return kpis
}

function categoriaDeEstoque(linhas: LinhaEstoque[]): ContagemCategoria[] {
  const map = new Map<CategoriaAtivo, number>()
  for (const l of linhas) {
    if (l.status === 'descartado' || !l.categoria) continue
    map.set(l.categoria, (map.get(l.categoria) ?? 0) + (l.total ?? 0))
  }
  return CATEGORIA_ORDEM.filter((c) => map.has(c)).map((categoria) => ({
    categoria,
    total: map.get(categoria) ?? 0,
  }))
}

export async function getKpis(
  client: DbClient,
  filialSlug: string | null,
): Promise<KpisRelatorio> {
  return kpisDeEstoque(await lerEstoqueAtual(client, filialSlug))
}

export async function getEstoquePorCategoria(
  client: DbClient,
  filialSlug: string | null,
): Promise<ContagemCategoria[]> {
  return categoriaDeEstoque(await lerEstoqueAtual(client, filialSlug))
}

// ---- Listas de estado atual ----

function modeloDe(marca: string | null, modelo: string | null): string {
  return [marca, modelo].filter(Boolean).join(' ').trim() || 'Sem modelo'
}

export async function getDisponiveisPorModelo(
  client: DbClient,
  filialId: number | null,
): Promise<ItemModelo[]> {
  // Pagina (o PostgREST corta em 1.000 por chamada); o estoque disponível pode
  // passar disso no consolidado ao longo do tempo. Ordena por `id` para o
  // .range() ser estável entre páginas.
  const map = new Map<string, number>()
  const PAGE = 1000
  for (let from = 0; from < 50_000; from += PAGE) {
    let q = client.from('ativos').select('marca, modelo').eq('status', 'em_estoque')
    if (filialId) q = q.eq('filial_id', filialId)
    q = q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    const { data, error } = await q
    if (error) throw new Error(`Falha ao listar disponíveis: ${error.message}`)
    for (const r of data ?? []) {
      const m = modeloDe(r.marca, r.modelo)
      map.set(m, (map.get(m) ?? 0) + 1)
    }
    if (!data || data.length < PAGE) break
  }
  return [...map.entries()]
    .map(([modelo, total]) => ({ modelo, total }))
    .sort((a, b) => b.total - a.total || a.modelo.localeCompare(b.modelo, 'pt-BR'))
}

// Estado atual + o chamado da última movimentação que tinha chamado.
export async function getReservadosComChamado(
  client: DbClient,
  filialId: number | null,
): Promise<ItemReservado[]> {
  let q = client
    .from('ativos')
    .select('id, patrimonio, marca, modelo')
    .eq('status', 'reservado')
    .limit(1000)
  if (filialId) q = q.eq('filial_id', filialId)
  const { data: ativos, error } = await q
  if (error) throw new Error(`Falha ao listar reservados: ${error.message}`)
  if (!ativos?.length) return []

  const ids = ativos.map((a) => a.id)
  // Pagina com desempate por `id` (o .in pode passar de 1.000 movs) e para
  // assim que achou o chamado mais recente de cada ativo.
  const chamadoPorAtivo = new Map<string, string>()
  const PAGE = 1000
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data: movs } = await client
      .from('movimentacoes')
      .select('ativo_id, chamado, created_at')
      .in('ativo_id', ids)
      .not('chamado', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    for (const m of movs ?? []) {
      if (m.chamado && !chamadoPorAtivo.has(m.ativo_id)) {
        chamadoPorAtivo.set(m.ativo_id, m.chamado)
      }
    }
    if (chamadoPorAtivo.size >= ids.length || !movs || movs.length < PAGE) break
  }

  return ativos
    .map((a) => ({
      patrimonio: a.patrimonio,
      modelo: modeloDe(a.marca, a.modelo),
      chamado: chamadoPorAtivo.get(a.id) ?? null,
    }))
    .sort((a, b) => a.patrimonio.localeCompare(b.patrimonio, 'pt-BR'))
}

// Em manutenção, caso a caso: observação da última movimentação do ativo.
export async function getEmManutencao(
  client: DbClient,
  filialId: number | null,
): Promise<ItemManutencao[]> {
  let q = client
    .from('ativos')
    .select('id, patrimonio, marca, modelo')
    .eq('status', 'em_manutencao')
    .limit(1000)
  if (filialId) q = q.eq('filial_id', filialId)
  const { data: ativos, error } = await q
  if (error) throw new Error(`Falha ao listar manutenção: ${error.message}`)
  if (!ativos?.length) return []

  const ids = ativos.map((a) => a.id)
  // Idem: pagina com desempate por `id` e para quando cobriu todos os ativos.
  const obsPorAtivo = new Map<string, string | null>()
  const PAGE = 1000
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data: movs } = await client
      .from('movimentacoes')
      .select('ativo_id, observacao, created_at')
      .in('ativo_id', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    for (const m of movs ?? []) {
      if (!obsPorAtivo.has(m.ativo_id)) obsPorAtivo.set(m.ativo_id, m.observacao)
    }
    if (obsPorAtivo.size >= ids.length || !movs || movs.length < PAGE) break
  }

  return ativos
    .map((a) => ({
      patrimonio: a.patrimonio,
      modelo: modeloDe(a.marca, a.modelo),
      observacao: obsPorAtivo.get(a.id) ?? null,
    }))
    .sort((a, b) => a.patrimonio.localeCompare(b.patrimonio, 'pt-BR'))
}

// ---- Série de movimentações adaptativa ao período (OS-F3 melhoria) ----
// O relatório da WAP é semanal; um gráfico fixo "por mês" mostrava uma barra só
// e ficava obsoleto no snapshot gerado. A granularidade agora acompanha a
// duração: janela curta (semana) → por DIA, média → por SEMANA, longa
// (ano/tudo) → por MÊS. Rótulos (ptBR) e eixo já vêm prontos, então o snapshot
// congelado é estável no tempo.

const MESES_ABREV = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

// Até 16 dias (uma semana/quinzena) → dia; até 120 dias (~um trimestre) →
// semana; acima disso → mês. Intervalo INCLUSIVO [de, ate].
function granularidadeDoPeriodo(periodo: Periodo): GranularidadeSerie {
  const dias =
    differenceInCalendarDays(parseISO(periodo.ate), parseISO(periodo.de)) + 1
  if (dias <= 16) return 'dia'
  if (dias <= 120) return 'semana'
  return 'mes'
}

function rotuloMes(mes: string, multiAno: boolean): string {
  const [ano, m] = mes.split('-')
  const nome = MESES_ABREV[Number(m) - 1] ?? mes
  return multiAno ? `${nome}/${ano.slice(2)}` : nome
}

function contarMeses(periodo: Periodo): number {
  const de = parseISO(periodo.de)
  const ate = parseISO(periodo.ate)
  return (
    (ate.getFullYear() * 12 + ate.getMonth()) -
    (de.getFullYear() * 12 + de.getMonth()) +
    1
  )
}

function mesesDoIntervalo(periodo: Periodo): string[] {
  const de = parseISO(periodo.de)
  const inicio = de.getFullYear() * 12 + de.getMonth()
  const qtd = contarMeses(periodo)
  const out: string[] = []
  for (let i = 0; i < qtd; i++) {
    const idx = inicio + i
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

// Mensal: agregação no banco (rel_mov_por_mes) — pode passar de 1.000 linhas se
// buscada linha a linha. Preenche o eixo com todos os meses quando são poucos
// (ano); no "tudo" (dezenas de meses) mostra só os meses com registro.
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

  const map = new Map<string, { saidas: number; devolucoes: number }>()
  for (const r of data ?? []) {
    const mes = String(r.mes).slice(0, 7)
    const cur = map.get(mes) ?? { saidas: 0, devolucoes: 0 }
    if (r.tipo === 'saida') cur.saidas = Number(r.total)
    else if (r.tipo === 'devolucao') cur.devolucoes = Number(r.total)
    map.set(mes, cur)
  }

  const baldes =
    contarMeses(periodo) <= 24
      ? mesesDoIntervalo(periodo)
      : [...map.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const multiAno = new Set(baldes.map((m) => m.slice(0, 4))).size > 1

  const pontos: PontoSerie[] = baldes.map((mes) => {
    const v = map.get(mes) ?? { saidas: 0, devolucoes: 0 }
    return {
      chave: mes,
      rotulo: rotuloMes(mes, multiAno),
      saidas: v.saidas,
      devolucoes: v.devolucoes,
    }
  })
  return { granularidade: 'mes', pontos }
}

function chaveSemana(dataISO: string): string {
  return format(startOfWeek(parseISO(dataISO), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

function baldesCurtos(periodo: Periodo, gran: 'dia' | 'semana'): string[] {
  const out: string[] = []
  const fim = gran === 'dia' ? parseISO(periodo.ate) : startOfWeek(parseISO(periodo.ate), { weekStartsOn: 1 })
  let d = gran === 'dia' ? parseISO(periodo.de) : startOfWeek(parseISO(periodo.de), { weekStartsOn: 1 })
  const passo = gran === 'dia' ? (x: Date) => addDays(x, 1) : (x: Date) => addWeeks(x, 1)
  while (d <= fim) {
    out.push(format(d, 'yyyy-MM-dd'))
    d = passo(d)
  }
  return out
}

// Dia/semana: baldes calculados no cliente a partir das linhas cruas (data,
// tipo). A janela é curta (<=120 dias) → volume limitado; paginado por
// segurança. Preenche o eixo inteiro (todos os dias/semanas), inclusive zeros —
// o relatório da semana mostra segunda a sexta mesmo sem movimento no dia.
async function serieCurta(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
  gran: 'dia' | 'semana',
): Promise<SerieMovimentacoes> {
  const contagem = new Map<string, { saidas: number; devolucoes: number }>()
  const PAGE = 1000
  const CAP = 50_000
  for (let from = 0; from < CAP; from += PAGE) {
    let q = client
      .from('movimentacoes')
      .select('data, tipo')
      .gte('data', periodo.de)
      .lte('data', periodo.ate)
      .in('tipo', ['saida', 'devolucao'])
    if (filialId) q = q.eq('filial_id', filialId)
    q = q
      .order('data', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    const { data, error } = await q
    if (error) throw new Error(`Falha na série de movimentações: ${error.message}`)
    for (const r of data ?? []) {
      const chave = gran === 'dia' ? r.data : chaveSemana(r.data)
      const cur = contagem.get(chave) ?? { saidas: 0, devolucoes: 0 }
      if (r.tipo === 'saida') cur.saidas += 1
      else if (r.tipo === 'devolucao') cur.devolucoes += 1
      contagem.set(chave, cur)
    }
    if (!data || data.length < PAGE) break
  }

  const pontos: PontoSerie[] = baldesCurtos(periodo, gran).map((chave) => {
    const v = contagem.get(chave) ?? { saidas: 0, devolucoes: 0 }
    return {
      chave,
      rotulo: format(parseISO(chave), 'dd/MM'),
      saidas: v.saidas,
      devolucoes: v.devolucoes,
    }
  })
  return { granularidade: gran, pontos }
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

// ---- Snapshot: reúne tudo num objeto serializável (OS-F3 3.1 / 3.8) ----

export async function getSnapshotRelatorio(
  client: DbClient,
  filialSlug: string,
  periodo: Periodo & { rotulo?: string },
  opts: { maxMovimentacoes?: number; geradoEm?: boolean } = {},
): Promise<SnapshotRelatorio> {
  const ehGeral = filialSlug === 'geral'
  const filial = ehGeral ? null : await resolverFilialPorSlug(client, filialSlug)
  if (!ehGeral && !filial) {
    throw new Error(`Filial "${filialSlug}" não encontrada`)
  }
  const filialId = filial?.id ?? null
  const slugParaView = ehGeral ? null : filialSlug
  const limite = opts.maxMovimentacoes ?? CAP_MOV_AO_VIVO

  const [
    estoque,
    disponiveis,
    reservados,
    manutencao,
    serie,
    porMotivo,
    pendencias,
    ultimas,
    resumo,
  ] = await Promise.all([
    lerEstoqueAtual(client, slugParaView),
    getDisponiveisPorModelo(client, filialId),
    getReservadosComChamado(client, filialId),
    getEmManutencao(client, filialId),
    getSerieMovimentacoes(client, filialId, periodo),
    getPorMotivo(client, filialId, periodo),
    getPendencias(client, slugParaView),
    getUltimasMovimentacoes(client, filialId, periodo, limite),
    getResumoPeriodo(client, filialId, periodo),
  ])

  return {
    meta: {
      filialSlug,
      filialNome: filial?.nome ?? 'Consolidado',
      ehGeral,
      de: periodo.de,
      ate: periodo.ate,
      periodoRotulo: periodo.rotulo ?? '',
    },
    kpis: kpisDeEstoque(estoque),
    estoquePorCategoria: categoriaDeEstoque(estoque),
    disponiveisPorModelo: disponiveis,
    reservados,
    emManutencao: manutencao,
    serieMovimentacoes: serie,
    porMotivo,
    pendencias,
    ultimasMovimentacoes: ultimas,
    resumo,
  }
}

export const CAPS = { snapshot: CAP_MOV_SNAPSHOT, aoVivo: CAP_MOV_AO_VIVO }

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
    const out: EstadoAtivo[] = []
    const PAGE = 1000
    for (let from = 0; from < 100_000; from += PAGE) {
      let q = client
        .from('ativos')
        .select('id, categoria, marca, modelo, filial_id, status, colaborador_atual, setor_atual')
        .neq('status', 'descartado')
      if (filialId) q = q.eq('filial_id', filialId)
      q = q.order('id', { ascending: true }).range(from, from + PAGE - 1)
      const { data, error } = await q
      if (error) throw new Error(`Falha ao ler estado atual: ${error.message}`)
      for (const r of data ?? []) {
        out.push({
          ativo_id: r.id,
          categoria: r.categoria,
          marca: r.marca,
          modelo: r.modelo,
          filial_id: r.filial_id,
          status: r.status,
          colaborador: r.colaborador_atual,
          setor: r.setor_atual,
        })
      }
      if (!data || data.length < PAGE) break
    }
    return out
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
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const PAGE = 1000
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data } = await client
      .from('movimentacoes')
      .select('ativo_id, chamado, created_at')
      .in('ativo_id', ids)
      .not('chamado', 'is', null)
      .lte('data', ate)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    for (const m of data ?? []) {
      if (m.chamado && !out.has(m.ativo_id)) out.set(m.ativo_id, m.chamado)
    }
    if (out.size >= ids.length || !data || data.length < PAGE) break
  }
  return out
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
  const retornoPorAtivo = new Map<string, { data: string; obs: string | null }>()
  for (const r of retornos ?? []) {
    if (!retornoPorAtivo.has(r.ativo_id)) retornoPorAtivo.set(r.ativo_id, { data: r.data, obs: r.observacao })
  }

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
      .lte('created_at', `${periodo.ate}T23:59:59.999-03:00`)
      .order('created_at', { ascending: true }),
  ])

  const envioPorAtivo = new Map<string, { data: string; obs: string | null; chamado: string | null }>()
  for (const e of enviosRaw.data ?? []) {
    if (!envioPorAtivo.has(e.ativo_id)) {
      envioPorAtivo.set(e.ativo_id, { data: e.data, obs: e.observacao, chamado: e.chamado })
    }
  }
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
  termo_assinado: 'sim' | 'nao' | 'enviado' | null
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
  const PAGE = 1000
  const CAP = 20000
  const todas: RawTabelaRow[] = []
  for (let from = 0; from < CAP; from += PAGE) {
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
    q = q
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    const { data, error } = await q
    if (error) throw new Error(`Falha ao montar tabela do período: ${error.message}`)
    const lote = (data ?? []) as unknown as RawTabelaRow[]
    todas.push(...lote)
    if (lote.length < PAGE) break
  }
  return todas
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
