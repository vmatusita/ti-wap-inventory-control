import 'server-only'
import { registrarFalha } from '@/lib/observabilidade'
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
  SerieEstado,
} from '@/lib/relatorios/tipos'
import {
  MIN_PONTOS_SERIE_ESTADO,
  datasDaSerieEstado,
  montarPontosEstado,
} from '@/lib/relatorios/serie-estado'
import {
  modeloDe,
  paginarPorIds,
  paginarTodos,
  ultimoPorAtivo,
  type DbClient,
} from './comum'
import { chamarRpc } from '@/lib/supabase/rpc'
import { linhasDe } from '@/lib/supabase/linhas'
import { LEITURA_REL_ESTOQUE_ASOF } from '@/lib/queries/formas/relatorios'

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

  // A RPC devolve UMA LINHA POR ATIVO — o mesmo domínio do fast path acima, e
  // portanto sujeita ao mesmo corte de 1.000 linhas do PostgREST. Ficou anos sem
  // paginação porque o acervo cabia embaixo do teto; os imports de go-live
  // (20–31/07/2026) o levaram a ~1,6 mil e o corte passou a valer, em silêncio:
  // `kpis` (fast path, paginado) contava o acervo inteiro e `kpisAnterior` (aqui)
  // parava em 1.000, e o comparativo do relatório anunciava centenas de ativos
  // novos que nunca existiram.
  //
  // A função SQL está CORRETA e devolve tudo — o defeito era só a leitura. O
  // `.order('ativo_id')` NÃO é enfeite: `rel_estoque_asof` não tem `order by` no
  // corpo, e paginar por OFFSET sem ordem total repete e perde linhas quando o
  // plano muda entre duas páginas (ver o bloco de `paginarTodos` em comum.ts).
  // `ativo_id` é uuid e há uma linha por ativo, então é ordem total.
  // F58: a linha as-of passa pela forma. `colaborador`/`setor` (e `marca`/`modelo`) chegam
  // anuláveis desde a porta de RPC — é o SQL vivo que o diz, não o gerador — e a forma confere
  // isso em runtime; a linha fora do formato LANÇA pelo mesmo caminho de erro desta função (e
  // `getSerieEstado`, que a embrulha num try/catch, continua degradando igual).
  const brutas = await paginarTodos(
    'Falha ao reconstruir o estoque as-of',
    (from, to) =>
      chamarRpc(client, 'rel_estoque_asof', {
        p_filial: filialId,
        p_data: ate,
      })
        .order('ativo_id', { ascending: true })
        .range(from, to),
  )
  const linhas = linhasDe(brutas, LEITURA_REL_ESTOQUE_ASOF.forma, LEITURA_REL_ESTOQUE_ASOF.rotulo)
  return linhas.map((r) => ({
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

// F32/RV-06 — "Evolução do estoque": um ponto de `em_estoque` por semana
// encerrada dentro do período, reconstruído AS-OF.
//
// SEM migration e SEM RPC nova (restrição da ordem): cada ponto é uma chamada de
// `lerEstadoAtivos`, que já sabe escolher entre o fast path (data ≥ hoje) e a
// reconstrução exata via `rel_estoque_asof`. As datas vêm da régua pura
// `datasDaSerieEstado`, que TAMBÉM é o teto de custo — ver ali o orçamento novo
// (6 leituras no pior caso, não mais 9).
//
// F32-pós (revisão de custo) — DOIS cortes, nenhum muda a forma do card:
// (a) REUSO DO ÚLTIMO PONTO. O último ponto da série é sempre `periodo.ate`, e
// `getSnapshotRelatorioV2` já lê `lerEstadoAtivos(..., periodo.ate)` como
// `estado` no MESMO Promise.all — reconstruir de novo aqui seria a MESMA leitura
// duas vezes dentro do mesmo request. `estadoNoFim` é essa promise já em voo,
// hoisted pelo chamador; quando a data do ponto bate com `periodo.ate` ela é
// reaproveitada em vez de disparar `lerEstadoAtivos` outra vez.
// (b) TETO MENOR. `MAX_SEMANAS_SERIE_ESTADO` caiu de 8 para 6 — ver serie-estado.ts.
//
// Devolve `undefined` — não uma série vazia — quando o período não junta pontos
// suficientes: é a diferença entre "o card não se aplica aqui" e "o card está
// vazio", e é `undefined` que faz o campo opcional simplesmente não existir no
// JSON congelado (o que mantém snapshots pré-F32 e pós-F32 com a MESMA forma).
//
// DEGRADAÇÃO: o card é opcional e decorativo (`serieEstado?` em tipos.ts) — ele
// não pode derrubar as contagens que não dependem dele. Por isso o corpo inteiro
// vive num try/catch: se qualquer uma das reconstruções as-of falhar (a RPC
// `rel_estoque_asof` lança em erro, ver `lerEstadoAtivos`), a rejeição é
// registrada com `registrarFalha` e a função devolve `undefined` — o mesmo valor
// que "período curto demais" já produz, e que o resto do sistema já sabe tratar
// como "sem card". Sem o try/catch, essa rejeição subiria pelo `Promise.all` de
// `getSnapshotRelatorioV2` e derrubaria a rota inteira (500) por causa de um
// card acessório — o mesmo cuidado que `itens.ts` já toma para dado decorativo.
//
// Esta função só ACRESCENTA leitura: nenhuma agregação existente passa por aqui,
// e o número de cada ponto é contado com a mesma régra de `kpisDeEstado` (as duas
// baixas terminais já saem de `lerEstadoAtivos`).
export async function getSerieEstado(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
  // Promise já em voo (hoisted por getSnapshotRelatorioV2) do estado no fim do
  // período — ver o corte (a) acima. Opcional: chamadores fora do snapshot v2
  // (se algum dia existirem) seguem funcionando sem reuso, só sem o desconto.
  estadoNoFim?: Promise<EstadoAtivo[]>,
): Promise<SerieEstado | undefined> {
  const datas = datasDaSerieEstado(periodo)
  if (datas.length < MIN_PONTOS_SERIE_ESTADO) return undefined

  try {
    const estados = await Promise.all(
      datas.map((data) =>
        data === periodo.ate && estadoNoFim
          ? estadoNoFim
          : lerEstadoAtivos(client, filialId, data),
      ),
    )
    const contagens = estados.map(
      (estado) => estado.filter((a) => a.status === 'em_estoque').length,
    )
    return { pontos: montarPontosEstado(datas, contagens) }
  } catch (err) {
    // Card opcional e decorativo: uma reconstrução as-of que falha aqui não pode
    // derrubar o relatório inteiro (KPIs, categoria×status etc. não dependem
    // desta série). Loga e degrada para "o card não se aplica" — ver o bloco
    // DEGRADAÇÃO acima.
    registrarFalha({ escopo: 'relatorios.serie-estado', erro: err })
    return undefined
  }
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
  // `ids` tinha um teto ACIDENTAL: vinha de leituras que elas próprias truncavam
  // em 1.000 (os retornos/devoluções de `manutencaoDeEstado`). Paginar aquelas
  // tirou o teto daqui junto — e uma lista grande de uuids estoura a URL antes
  // mesmo do corte de linhas. Por lotes resolve os dois.
  type Linha = { id: string } & DadosAtivo
  const linhas = await paginarPorIds<Linha>('Falha ao ler ativos', ids, (lote, from, to) =>
    client
      .from('ativos')
      .select('id, patrimonio, marca, modelo, filial_id')
      .in('id', lote)
      .order('id', { ascending: true })
      .range(from, to),
  )
  for (const r of linhas)
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
  // Já paginava; o que faltava era quebrar o `.in()` em lotes — pelo mesmo motivo
  // de `dadosAtivos` (URL). A ordenação por ativo continua correta: o desempate
  // de `ultimoPorAtivo` é DENTRO de cada ativo, e um ativo nunca se divide entre
  // dois lotes.
  const rows = await paginarPorIds<LinhaChamado>(
    'Falha ao ler chamados as-of',
    ids,
    (lote, from, to) =>
      client
        .from('movimentacoes')
        .select('ativo_id, chamado, created_at')
        .in('ativo_id', lote)
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
  //
  // As leituras desta função LANÇAM em erro, como todas as irmãs do módulo
  // (`dadosAtivos`, `chamadoAteData`, `lerEstadoAtivos`). Antes o canal `error`
  // era descartado e um `data` nulo virava "ninguém voltou da manutenção": a
  // seção saía incompleta sem nenhum sinal — e `gerarRelatorio` CONGELAVA esse
  // resultado errado num snapshot imutável. Falhar alto é a única saída honesta.
  // `paginarTodos` mantém isso: ela lança com o rótulo em qualquer página.
  //
  // Paginadas porque o filtro é só tipo + período, e o período pode ser o preset
  // "Tudo" (2000-01-01 até hoje) — o mesmo par que `buscarLinhasPeriodo` e
  // `getLancamentosItensPeriodo` já tratavam com `paginarTodos`; estas duas
  // ficaram de fora da proteção. Desempate por `id`: `created_at` empata dentro
  // de uma mesma transação (um lote de movimentações grava tudo no mesmo
  // instante), e ordenação com empate não serve para paginar.
  type LinhaMov = { ativo_id: string; data: string; observacao: string | null }
  const retornos = await paginarTodos<LinhaMov>(
    'Falha ao ler retornos de manutenção',
    (from, to) => {
      let q = client
        .from('movimentacoes')
        .select('ativo_id, data, observacao')
        .eq('tipo', 'retorno_manutencao')
        .gte('data', periodo.de)
        .lte('data', periodo.ate)
      if (filialId) q = q.eq('filial_id', filialId)
      return q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    },
  )
  const retornoPorAtivo = ultimoPorAtivo(
    retornos,
    (r) => r.ativo_id,
    (r) => ({ data: r.data, obs: r.observacao }),
  )

  // F14/§0 — quem foi DEVOLVIDO AO FORNECEDOR no período (outro desfecho do caso,
  // com badge própria; o ativo saiu do inventário, como no descarte).
  const devolucoes = await paginarTodos<LinhaMov>(
    'Falha ao ler devoluções ao fornecedor',
    (from, to) => {
      let q = client
        .from('movimentacoes')
        .select('ativo_id, data, observacao')
        .eq('tipo', 'devolucao_fornecedor')
        .gte('data', periodo.de)
        .lte('data', periodo.ate)
      if (filialId) q = q.eq('filial_id', filialId)
      return q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    },
  )
  const devolucaoPorAtivo = ultimoPorAtivo(
    devolucoes,
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

  // Estas duas herdavam de `ids` um teto que nem era delas: `ids` vinha dos
  // retornos/devoluções acima, que truncavam em 1.000 e por tabela mantinham a
  // lista pequena por acidente. Paginar aquelas removeu o acidente — então estas
  // passam a ler por lotes de id, cada lote paginado. (Mesmo motivo do `throw`
  // de antes: sem envio não há data, dias em manutenção nem chamado do
  // fornecedor, e o card sairia mudo em vez de acusar a falha; `paginarPorIds`
  // lança igual.)
  type LinhaEnvio = {
    ativo_id: string
    data: string
    observacao: string | null
    chamado: string | null
    chamado_fornecedor: string | null
    created_at: string
  }
  type AnotRow = {
    ativo_id: string
    texto: string
    created_at: string
    autor: { nome: string | null } | null
  }
  const [dados, envios, anotacoesRows] = await Promise.all([
    dadosAtivos(client, ids),
    paginarPorIds<LinhaEnvio>(
      'Falha ao ler envios de manutenção',
      ids,
      (lote, from, to) =>
        client
          .from('movimentacoes')
          .select('ativo_id, data, observacao, chamado, chamado_fornecedor, created_at')
          .in('ativo_id', lote)
          .eq('tipo', 'envio_manutencao')
          .lte('data', periodo.ate)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
    ),
    paginarPorIds<AnotRow>(
      'Falha ao ler anotações da manutenção',
      ids,
      (lote, from, to) =>
        client
          .from('anotacoes')
          .select('ativo_id, texto, created_at, autor:profiles!anotacoes_criado_por_fkey(nome)')
          .in('ativo_id', lote)
          // Fim do dia `ate` no fuso de São Paulo (UTC-3 fixo), não em UTC — senão as
          // anotações das últimas 3h do dia (21:00–23:59 BRT) cairiam para fora.
          .lte('created_at', fimDoDiaSP(periodo.ate))
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
    ),
  ])

  const envioPorAtivo = ultimoPorAtivo(
    envios,
    (e) => e.ativo_id,
    (e) => ({
      data: e.data,
      obs: e.observacao,
      chamado: e.chamado,
      chamadoFornecedor: e.chamado_fornecedor,
    }),
  )
  const anotacoesPorAtivo = new Map<string, { texto: string; autor: string | null; em: string }[]>()
  for (const a of anotacoesRows) {
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
