import type {
  CategoriaAtivo,
  TermoStatus,
  TipoMovimentacao,
} from '@/lib/dominio'
import { OBS_CARGA_GOLIVE, OBS_IMPORT_STARTUP, rotuloTermo } from '@/lib/dominio'
import type { Periodo } from '@/lib/relatorios/periodo'
import {
  granularidadeDoPeriodo,
  montarSerieCurta,
  montarSerieMensal,
  type LinhaSerieCurta,
} from '@/lib/relatorios/serie'
import type {
  LinhaEntrada,
  LinhaSaida,
  LinhaTransferencia,
  MovimentacaoRelatorio,
  PorMotivo,
  ResumoFilial,
  ResumoMotivo,
  ResumoPeriodo,
  ResumoTipo,
  SerieMovimentacoes,
} from '@/lib/relatorios/tipos'
import { marcaEstorno } from '@/lib/relatorios/estorno'
import { modeloDe, paginarTodos, type DbClient } from './comum'

// Agregações sobre a tabela `movimentacoes` no período (OS-F3 3.6): a série
// adaptativa, saídas/devoluções por motivo, o resumo no formato do e-mail, as
// últimas movimentações (tabela + CSV) e as tabelas detalhadas do fecho. Toda a
// matemática de calendário/série vive em lib/relatorios/serie.ts (pura, testada);
// aqui ficam só as leituras do banco, que passam as linhas cruas aos builders.

// ---- Série de movimentações adaptativa ao período (OS-F3 melhoria) ----
// A granularidade acompanha a duração do período (dia/semana/mês).

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

// ---- Fragmento base dos selects de movimentação (últimas + tabelas) ----
// MOV_SELECT (últimas) e TAB_SELECT (tabelas detalhadas) compartilham as colunas
// diretas + os embeds de ativo/filial; TAB_SELECT acrescenta motivo/termo/itens
// faltantes + destino + rótulo do motivo. Fonte única para não divergirem.
const MOV_COLS = 'id, data, tipo, chamado, observacao, colaborador, setor'
// F16/T3: `id` do ativo entra no embed para o patrimônio da tabela virar link p/
// a ficha (`/ativos/[id]`). Inócuo para as "últimas movimentações" (v1), que
// ignoram o campo em `mapMovRows`.
const ATIVO_EMBED =
  'ativo:ativos!movimentacoes_ativo_id_fkey(id, patrimonio, marca, modelo, categoria)'
const FILIAL_EMBED = 'filial:filiais!movimentacoes_filial_id_fkey(nome)'

type RawMovBase = {
  id: string
  data: string
  tipo: TipoMovimentacao
  chamado: string | null
  observacao: string | null
  colaborador: string | null
  setor: string | null
  ativo: {
    id: string
    patrimonio: string
    marca: string | null
    modelo: string | null
    categoria: CategoriaAtivo
  } | null
  filial: { nome: string } | null
}

// ---- Últimas movimentações do período (tabela + CSV) ----

type RawMovRow = RawMovBase

const MOV_SELECT = `${MOV_COLS}, ${ATIVO_EMBED}, ${FILIAL_EMBED}`

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
    // F6A-A1: exclui as compras sintéticas de abertura da carga go-live. .neq
    // sozinho descartaria observacao IS NULL (PostgREST) — .or null-safe preserva.
    .or(`observacao.is.null,observacao.neq."${OBS_CARGA_GOLIVE}"`)
    // F7/F8: exclui TODAS as movimentações do import de startup — a COMPRA de abertura
    // (SEMPRE marcada, com ou sem data, desde a F8/migration 0036) e o AJUSTE de
    // reconciliação. Nenhuma é entrada real do período; a data real da compra vale só p/
    // o histórico as-of e a ficha. Entrada "de verdade" é a lançada manualmente (sem
    // marcador → aparece aqui). [A F7H/0035 abriu exceção p/ a compra datada; REVERTIDA
    // pela F8 — a planilha não distingue compra nova de saldo de abertura.] A observação é
    // `import startup dd/MM/yyyy` (data variável) → filtro por PREFIXO com not.like (`*`).
    // Segundo .or() é ANDado no topo → (null OU ≠golive) AND (null OU NÃO começa com o marcador).
    .or(`observacao.is.null,observacao.not.like."${OBS_IMPORT_STARTUP}*"`)
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

// ---- Tabelas detalhadas do período (§4.4). Paginadas com desempate por id. ----

type RawTabelaRow = RawMovBase & {
  motivo: string | null
  termo_assinado: TermoStatus | null
  itens_faltantes: string[] | null
  destino: { nome: string } | null
  motivoRotulo: { rotulo: string } | null
}

const TAB_SELECT =
  `${MOV_COLS}, motivo, termo_assinado, itens_faltantes, ` +
  `${ATIVO_EMBED}, ${FILIAL_EMBED}, ` +
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
        // F6A-A1: exclui a carga go-live (compras sintéticas). Uniforme p/
        // Saídas/Entradas/Transferências — nenhuma mov legítima carrega esse
        // texto exato. .or null-safe preserva linhas com observacao IS NULL;
        // fica ANDado com o .or() de origem/destino da transferência abaixo.
        .or(`observacao.is.null,observacao.neq."${OBS_CARGA_GOLIVE}"`)
        // F7/F8: exclui TODAS as movimentações do import de startup — a COMPRA de
        // abertura (SEMPRE marcada, com ou sem data, desde a F8/0036) e o AJUSTE. A data
        // real da compra vale só p/ o histórico as-of e a ficha; entrada "de verdade" é a
        // lançada manualmente (sem marcador). [A F7H/0035 expunha a compra datada nas
        // Entradas; REVERTIDA pela F8.] Observação `import startup dd/MM/yyyy` → filtro por
        // PREFIXO (not.like, `*`). Cada .or() é ANDado no topo → preserva a null-safety e o
        // .or() de origem/destino.
        .or(`observacao.is.null,observacao.not.like."${OBS_IMPORT_STARTUP}*"`)
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

// F16/T1 — quais movimentações do período FORAM estornadas, e quando. Sem coluna
// "estornada": o estorno é OUTRA linha (`tipo='estorno'` + `estorno_de`→id da
// original), como a ficha (linha-do-tempo.tsx) já infere. Aqui a mesma doutrina no
// relatório: um Map `estorno_de → data do estorno`. Bounded por `ate` (as-of): um
// snapshot congelado não passa a exibir um estorno feito DEPOIS de gerado; e o par
// mov+estorno é coerente com a reconstrução as-of do estado. Sem filtro de filial —
// o estorno de um ativo transferido pode ter filial diferente da original, e o
// volume de estornos (válvula administrativa rara) é pequeno; a interseção é por id.
async function buscarEstornosAteData(
  client: DbClient,
  ate: string,
): Promise<Map<string, string>> {
  const rows = await paginarTodos<{ estorno_de: string | null; data: string }>(
    'Falha ao ler estornos',
    (from, to) =>
      client
        .from('movimentacoes')
        .select('estorno_de, data')
        .eq('tipo', 'estorno')
        .not('estorno_de', 'is', null)
        .lte('data', ate)
        .order('id', { ascending: true })
        .range(from, to),
  )
  const map = new Map<string, string>()
  for (const r of rows) if (r.estorno_de && !map.has(r.estorno_de)) map.set(r.estorno_de, r.data)
  return map
}

export async function getTabelasFinais(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<{ saidas: LinhaSaida[]; entradas: LinhaEntrada[]; transferencias: LinhaTransferencia[] }> {
  const [saidasRaw, entradasRaw, transfRaw, estornos] = await Promise.all([
    buscarLinhasPeriodo(client, filialId, periodo, ['saida', 'emprestimo']),
    // F15: `troca` (nascimento do substituto) é ENTRADA real do período, como a compra
    // e a devolução — aparece nas Entradas rotulada "Troca" (nunca contada como compra).
    // Os filtros de observação acima não a derrubam: a RPC devolver_ao_fornecedor grava
    // observação própria (nunca os marcadores de go-live/import) e o import não gera troca.
    buscarLinhasPeriodo(client, filialId, periodo, ['devolucao', 'compra', 'troca']),
    buscarLinhasPeriodo(client, filialId, periodo, ['transferencia'], true),
    buscarEstornosAteData(client, periodo.ate),
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
    ativoId: r.ativo?.id,
    ...marcaEstorno(estornos.get(r.id)),
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
    ativoId: r.ativo?.id,
    ...marcaEstorno(estornos.get(r.id)),
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
    ativoId: r.ativo?.id,
    ...marcaEstorno(estornos.get(r.id)),
  }))

  return { saidas, entradas, transferencias }
}
