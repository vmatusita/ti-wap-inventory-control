import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseISO,
  format,
  differenceInCalendarDays,
  startOfWeek,
  addDays,
  addWeeks,
} from 'date-fns'
import type { Database } from '@/lib/types/database'
import type { CategoriaAtivo, StatusAtivo } from '@/lib/dominio'
import { CATEGORIA_ORDEM } from '@/lib/dominio'
import type { Periodo } from '@/lib/relatorios/periodo'
import type {
  ChipPendencia,
  ContagemCategoria,
  GranularidadeSerie,
  ItemManutencao,
  ItemModelo,
  ItemReservado,
  KpisRelatorio,
  MovimentacaoRelatorio,
  PontoSerie,
  PorMotivo,
  ResumoFilial,
  ResumoMotivo,
  ResumoPeriodo,
  ResumoTipo,
  SerieMovimentacoes,
  SnapshotRelatorio,
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

// Período INTEIRO, paginado (o PostgREST corta em 1.000 por chamada). Usado no
// export CSV do período na página ao vivo (OS-F3 3.5.1).
export async function getTodasMovimentacoesPeriodo(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<MovimentacaoRelatorio[]> {
  const PAGE = 1000
  const CAP = 20000
  const todas: MovimentacaoRelatorio[] = []
  for (let from = 0; from < CAP; from += PAGE) {
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
      .range(from, from + PAGE - 1)
    const { data, error } = await q
    if (error) throw new Error(`Falha ao exportar movimentações: ${error.message}`)
    const lote = mapMovRows(data)
    todas.push(...lote)
    if (lote.length < PAGE) break
  }
  return todas
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
