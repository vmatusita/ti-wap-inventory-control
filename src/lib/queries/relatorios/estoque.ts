import { parseISO, differenceInCalendarDays } from 'date-fns'
import type { CategoriaAtivo, StatusAtivo } from '@/lib/dominio'
import { CATEGORIA_ORDEM, STATUS_ORDEM } from '@/lib/dominio'
import { dataEmSP, fimDoDiaSP, hojeISO } from '@/lib/format'
import type { Periodo } from '@/lib/relatorios/periodo'
import type {
  ContagemCategoria,
  EstoqueCatStatus,
  ItemModelo,
  ItemReservado,
  KpisRelatorio,
  ManutencaoCaso,
  ModelosPorCategoria,
} from '@/lib/relatorios/tipos'
import { modeloDe, paginarTodos, ultimoPorAtivo, type DbClient } from './comum'

// Estoque no fim do período: KPIs, categoria × status, disponíveis por modelo,
// reservados e manutenção — TUDO derivado do estado reconstruído AS-OF (OS-F3
// 3.5/3.6). Estado atual = fast path barato (período terminando hoje); passado =
// reconstrução exata via rel_estoque_asof. Fonte unificada do relatório v2 e do
// dashboard (getKpis). `descartado` nunca entra (baixa).

// Estado de um ativo (atual ou as-of). Fonte unificada dos KPIs, categoria×
// status, disponíveis por modelo, reservados e manutenção.
export type EstadoAtivo = {
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
export async function lerEstadoAtivos(
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
          // F14: exclui as DUAS baixas terminais (descartado e devolvido ao fornecedor).
          .not('status', 'in', '("descartado","devolvido_fornecedor")')
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

export function kpisDeEstado(estado: EstadoAtivo[]): KpisRelatorio {
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
    if (a.status === 'descartado' || a.status === 'devolvido_fornecedor') continue
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

export function categoriaDeEstado(estado: EstadoAtivo[]): ContagemCategoria[] {
  const map = new Map<CategoriaAtivo, number>()
  for (const a of estado) {
    if (a.status === 'descartado' || a.status === 'devolvido_fornecedor') continue
    map.set(a.categoria, (map.get(a.categoria) ?? 0) + 1)
  }
  return CATEGORIA_ORDEM.filter((c) => map.has(c)).map((categoria) => ({
    categoria,
    total: map.get(categoria) ?? 0,
  }))
}

export function estoqueCatStatusDeEstado(estado: EstadoAtivo[]): EstoqueCatStatus[] {
  const map = new Map<CategoriaAtivo, Map<StatusAtivo, number>>()
  for (const a of estado) {
    if (a.status === 'descartado' || a.status === 'devolvido_fornecedor') continue
    if (!map.has(a.categoria)) map.set(a.categoria, new Map())
    const m = map.get(a.categoria)!
    m.set(a.status, (m.get(a.status) ?? 0) + 1)
  }
  return CATEGORIA_ORDEM.filter((c) => map.has(c)).map((categoria) => {
    const m = map.get(categoria)!
    const segmentos = STATUS_ORDEM.filter(
      (s) => s !== 'descartado' && s !== 'devolvido_fornecedor' && m.has(s),
    ).map((status) => ({ status, total: m.get(status) ?? 0 }))
    return { categoria, segmentos, total: segmentos.reduce((s, x) => s + x.total, 0) }
  })
}

export function disponiveisPorModeloDeEstado(estado: EstadoAtivo[]): ModelosPorCategoria[] {
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
// patrimonio pode ser null (F7E — ativo sem plaqueta); os consumidores já usam
// `?? '—'` na exibição do relatório.
type DadosAtivo = { patrimonio: string | null; marca: string | null; modelo: string | null; filial_id: number }

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

export async function reservadosDeEstado(
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
export async function manutencaoDeEstado(
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

  // F14/§0 — quem foi DEVOLVIDO AO FORNECEDOR no período (outro desfecho do caso,
  // com badge própria; o ativo saiu do inventário, como no descarte).
  let devQ = client
    .from('movimentacoes')
    .select('ativo_id, data, observacao')
    .eq('tipo', 'devolucao_fornecedor')
    .gte('data', periodo.de)
    .lte('data', periodo.ate)
  if (filialId) devQ = devQ.eq('filial_id', filialId)
  const { data: devolucoes } = await devQ.order('created_at', { ascending: false })
  const devolucaoPorAtivo = ultimoPorAtivo(
    devolucoes ?? [],
    (r) => r.ativo_id,
    (r) => ({ data: r.data, obs: r.observacao }),
  )

  const ids = [
    ...new Set([
      ...emManutencao,
      ...retornoPorAtivo.keys(),
      ...devolucaoPorAtivo.keys(),
    ]),
  ]
  if (ids.length === 0) return []

  const [dados, enviosRaw, anotacoesRaw] = await Promise.all([
    dadosAtivos(client, ids),
    client
      .from('movimentacoes')
      .select('ativo_id, data, observacao, chamado, chamado_fornecedor, created_at')
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
    (e) => ({
      data: e.data,
      obs: e.observacao,
      chamado: e.chamado,
      chamadoFornecedor: e.chamado_fornecedor,
    }),
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
    const devolucao = devolucaoPorAtivo.get(id) ?? null
    // Desfecho do caso: retorno (voltou) OU devolvido ao fornecedor. Se os dois
    // ocorreram no período (episódios distintos), vence o mais recente por data.
    let desfecho: 'retorno' | 'devolvido_fornecedor' | undefined
    let encerramento: { data: string; obs: string | null } | null = null
    if (retorno && devolucao) {
      if (devolucao.data >= retorno.data) {
        desfecho = 'devolvido_fornecedor'
        encerramento = devolucao
      } else {
        desfecho = 'retorno'
        encerramento = retorno
      }
    } else if (devolucao) {
      desfecho = 'devolvido_fornecedor'
      encerramento = devolucao
    } else if (retorno) {
      desfecho = 'retorno'
      encerramento = retorno
    }
    const fechado = !!encerramento
    const fim = encerramento ? encerramento.data : periodo.ate
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
      // F16/T3 — id do ativo para o patrimônio do card virar link p/ a ficha (operador).
      ativoId: id,
      patrimonio: d?.patrimonio ?? '—',
      modelo: modeloDe(d?.marca ?? est?.marca ?? null, d?.modelo ?? est?.modelo ?? null),
      // filial as-of; se o ativo saiu do estado da filial (transferido/descartado
      // após o retorno no período), cai no filial_id atual (dadosAtivos).
      filial: filiaisNome.get(est?.filial_id ?? d?.filial_id ?? -1) ?? '—',
      chamado: envio?.chamado ?? null,
      chamadoFornecedor: envio?.chamadoFornecedor ?? null,
      dataEnvio: envio?.data ?? null,
      diasEmManutencao: dias,
      obsEnvio: envio?.obs ?? null,
      anotacoes,
      retornoData: encerramento?.data ?? null,
      retornoObs: encerramento?.obs ?? null,
      fechado,
      desfecho,
    }
  })

  // Abertos primeiro (mais dias no topo), fechados depois.
  return casos.sort((a, b) => {
    if (a.fechado !== b.fechado) return a.fechado ? 1 : -1
    return (b.diasEmManutencao ?? 0) - (a.diasEmManutencao ?? 0)
  })
}
