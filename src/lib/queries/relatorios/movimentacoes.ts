import 'server-only'
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
import { CAP_MOVIMENTACOES, modeloDe, paginarTodos, type DbClient } from './comum'
import { chamarRpc } from '@/lib/supabase/rpc'
import { linhasDe } from '@/lib/supabase/linhas'
import {
  LEITURA_REL_MOV_POR_MES,
  LEITURA_REL_POR_MOTIVO,
  LEITURA_REL_RESUMO,
  LEITURA_TABELA_DO_PERIODO,
  LEITURA_ULTIMAS_MOVIMENTACOES,
} from '@/lib/queries/formas/relatorios'

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
  const { data, error } = await chamarRpc(client, 'rel_mov_por_mes', {
    p_filial: filialId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  })
  if (error) throw new Error(`Falha nas movimentações por mês: ${error.message}`)
  return montarSerieMensal(linhasDe(data, LEITURA_REL_MOV_POR_MES.forma, LEITURA_REL_MOV_POR_MES.rotulo), periodo)
}

// Dia/semana: baldes calculados a partir das linhas cruas (data, tipo). A janela
// é curta (<=120 dias) → volume limitado; paginado por segurança até o teto único.
async function serieCurta(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
  gran: 'dia' | 'semana',
): Promise<SerieMovimentacoes> {
  // OFFSET, não keyset (F60 · PLAN §2.1, #46): ordem composta `data, id` sem cursor simples.
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
    CAP_MOVIMENTACOES,
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
  const { data, error } = await chamarRpc(client, 'rel_por_motivo', {
    p_filial: filialId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  })
  if (error) throw new Error(`Falha em saídas/devoluções por motivo: ${error.message}`)
  const linhas = linhasDe(data, LEITURA_REL_POR_MOTIVO.forma, LEITURA_REL_POR_MOTIVO.rotulo)

  const filtra = (tipo: 'saida' | 'devolucao') =>
    linhas
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
  const { data, error } = await chamarRpc(client, 'rel_resumo', {
    p_filial: filialId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  })
  if (error) throw new Error(`Falha ao montar o resumo: ${error.message}`)
  const rows = linhasDe(data, LEITURA_REL_RESUMO.forma, LEITURA_REL_RESUMO.rotulo)

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

// ---- Os selects de movimentação (últimas + tabelas) ----
// MOV_SELECT (últimas) e TAB_SELECT (tabelas detalhadas) compartilham as colunas diretas + os
// embeds de ativo/filial; desde a F58 os dois moram em `queries/formas/relatorios.ts`, como
// LITERAIS (o TAB_SELECT era montado por `+` e a inferência do supabase-js caía), junto das formas
// que conferem as linhas. F16/T3: `id` do ativo entra no embed para o patrimônio da tabela virar
// link p/ a ficha (`/ativos/[id]`); as "últimas movimentações" ignoram o campo em `mapMovRows`.

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
    // F58: `ativos.patrimonio` perdeu o `not null` na migration 0034 (ativo sem plaqueta); o
    // tipo à mão dizia `string`, e o cast de `mapMovRows` escondia isso. Os consumidores já
    // tratavam o nulo com `?? '—'`.
    patrimonio: string | null
    marca: string | null
    modelo: string | null
    categoria: CategoriaAtivo
  } | null
  filial: { nome: string } | null
}

// ---- Últimas movimentações do período (tabela + CSV) ----

type RawMovRow = RawMovBase

function mapMovRows(rows: readonly RawMovRow[]): MovimentacaoRelatorio[] {
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
    .select(LEITURA_ULTIMAS_MOVIMENTACOES.select)
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
    // F23: a CORREÇÃO TÉCNICA do desenvolvedor (ferramenta "Forçar estado" da /dev) não é
    // operação do dia — e este é o ÚNICO ponto de relatório/dashboard onde ela apareceria.
    //
    // ⚠ Por que só AQUI, e por que isto não é uma exceção frágil. Todas as outras leituras de
    // relatório filtram por ALLOW-LIST de tipo (`saida`/`devolucao`, ou `compra`/`troca`…), e a
    // correção-dev é do tipo `ajuste` — já está fora de todas elas, sem precisar de nada. Esta
    // função é a única sem allow-list de tipo: ela mostra "as últimas movimentações",
    // quaisquer que sejam. Levantamento completo dos 20 pontos de leitura em
    // docs/RELATORIO-F23.md.
    //
    // `forcado` é NOT NULL com default false (migration 0079), então `.eq(false)` não descarta
    // linha nenhuma por nulidade — ao contrário dos dois `.or()` acima, que precisam ser
    // null-safe porque `observacao` é anulável.
    .eq('forcado', false)
  if (filialId) q = q.eq('filial_id', filialId)
  q = q
    .order('created_at', { ascending: false })
    .order('data', { ascending: false })
    .order('id', { ascending: false })
    .limit(limite)

  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar movimentações: ${error.message}`)
  return mapMovRows(linhasDe(data, LEITURA_ULTIMAS_MOVIMENTACOES.forma, LEITURA_ULTIMAS_MOVIMENTACOES.rotulo))
}

// ---- Tabelas detalhadas do período (§4.4). Paginadas com desempate por id. ----

type RawTabelaRow = RawMovBase & {
  motivo: string | null
  termo_assinado: TermoStatus | null
  itens_faltantes: string[] | null
  destino: { nome: string } | null
  motivoRotulo: { rotulo: string } | null
}

async function buscarLinhasPeriodo(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
  tipos: TipoMovimentacao[],
  incluirDestino = false,
): Promise<RawTabelaRow[]> {
  // OFFSET, não keyset (F60 · PLAN §2.1, #47): ordem composta tripla `data desc, created_at desc,
  // id desc` — a ordem VISÍVEL das três tabelas, sem cursor simples.
  const brutas = await paginarTodos(
    'Falha ao montar tabela do período',
    (from, to) => {
      let q = client
        .from('movimentacoes')
        .select(LEITURA_TABELA_DO_PERIODO.select)
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
    CAP_MOVIMENTACOES,
  )
  return linhasDe(brutas, LEITURA_TABELA_DO_PERIODO.forma, LEITURA_TABELA_DO_PERIODO.rotulo)
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
  // F60 (PLAN §2.1, #48 e §6.7): só o TETO nesta etapa — a leitura muda de FORMA no lote 2
  // (`paginarPorIds` por `.in('estorno_de', ids)` depois das três tabelas, P6, em keyset), e
  // migrar para keyset aqui seria reescrever duas vezes a mesma leitura. Teto do domínio: há no
  // máximo um estorno por movimentação.
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
    CAP_MOVIMENTACOES,
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
