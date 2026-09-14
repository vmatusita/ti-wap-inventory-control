import 'server-only'
import { periodoAnterior, type Periodo } from '@/lib/relatorios/periodo'
import type { SnapshotRelatorioV2 } from '@/lib/relatorios/tipos'
import { listarFiliais } from '@/lib/queries/filiais'
import { resolverFilialPorSlug, type DbClient } from './comum'
import {
  categoriaDeEstado,
  disponiveisPorModeloDeEstado,
  estoqueCatStatusDeEstado,
  getSerieEstado,
  kpisDeEstado,
  lerEstadoAtivos,
  manutencaoDeEstado,
  reservadosDeEstado,
} from './estoque'
import {
  getPorMotivo,
  getResumoPeriodo,
  getSerieMovimentacoes,
  getTabelasFinais,
} from './movimentacoes'
import { getGruposItens, getLancamentosItensPeriodo } from './itens'
import { getPendencias } from './pendencias'
import { chipManutencaoParada } from '@/lib/relatorios/manutencao-alerta'
import { SLUG_CONSOLIDADO } from '@/lib/unidades/slugs'

// ===========================================================================
// RELATÓRIO v2 (formato do e-mail — F3B). Estado reconstruído AS-OF no fim do
// período (fast path quando o período termina hoje), 3 grupos, KPIs com Δ e as
// tabelas detalhadas. getSnapshotRelatorioV2 reúne as agregações dos módulos
// (estoque · movimentacoes · itens · pendencias) num objeto schema 2 — o JSON
// serializável que a geração de relatório (3.8/3.10) congela.
// ===========================================================================

// O período anterior de MESMA duração (comparativo do Δ dos KPIs: o estado as-of do
// último dia do período anterior, véspera de `de`) mora em `lib/relatorios/periodo.ts`
// desde a F29 — o rótulo do Δ na tela precisa da MESMA janela que o número, e aquele
// módulo é puro, importável por componente de apresentação.

// Monta o SnapshotRelatorio schema 2 (serializável, congelável).
export async function getSnapshotRelatorioV2(
  client: DbClient,
  filialSlug: string,
  periodo: Periodo & { rotulo?: string },
  // A5/F6A: o viewer por senha NÃO recebe pendências (defesa em profundidade; o
  // corte de verdade é no render). Geração de snapshot e operador mantêm `true`.
  incluirPendencias = true,
): Promise<SnapshotRelatorioV2> {
  const ehGeral = filialSlug === SLUG_CONSOLIDADO
  const filial = ehGeral ? null : await resolverFilialPorSlug(client, filialSlug)
  if (!ehGeral && !filial) throw new Error(`Filial "${filialSlug}" não encontrada`)
  const filialId = filial?.id ?? null
  const slugParaView = ehGeral ? null : filialSlug
  const anterior = periodoAnterior(periodo)

  // F32-pós (revisão de custo, ACHADO 7) — hoisted ANTES do Promise.all: guarda a
  // PROMISE (não o await), não a chamada em si. `getSerieEstado` também precisa
  // do estado no fim do período (o último ponto da série É `periodo.ate`), e sem
  // este hoist ela reconstruiria a mesma leitura as-of DE NOVO dentro do mesmo
  // request — dobrando o custo do ponto mais caro. Os dois consumidores abaixo
  // (o `estado` do Promise.all e o 4º parâmetro de `getSerieEstado`) esperam a
  // MESMA promise, então o paralelismo entre eles fica intacto: só a duplicação
  // de trabalho é que some.
  const estadoNoFim = lerEstadoAtivos(client, filialId, periodo.ate)

  const [
    estado,
    estadoAnt,
    serie,
    porMotivo,
    pendencias,
    grupos,
    tabelas,
    resumo,
    movsItens,
    serieEstado,
    filiais,
  ] = await Promise.all([
      estadoNoFim,
      lerEstadoAtivos(client, filialId, anterior.ate),
      getSerieMovimentacoes(client, filialId, periodo),
      getPorMotivo(client, filialId, periodo),
      incluirPendencias
        // F25 — `getPendencias` passou a receber LISTA de slugs. O relatório é de
        // UMA filial (ou consolidado: `[]`), então a tradução é aqui e o snapshot
        // congelado não muda de forma.
        ? getPendencias(client, slugParaView ? [slugParaView] : [])
        : Promise.resolve([] as SnapshotRelatorioV2['pendencias']),
      getGruposItens(client, filialId, periodo),
      getTabelasFinais(client, filialId, periodo),
      getResumoPeriodo(client, filialId, periodo),
      getLancamentosItensPeriodo(client, filialId, periodo),
      // F32/RV-06 — a evolução do estoque entra no MESMO Promise.all: ela é o
      // caminho mais lento da página (até 6 reconstruções as-of no pior caso, ver
      // `getSerieEstado`), e serializá-la depois somaria o tempo dela ao de tudo
      // que já roda aqui. Recebe `estadoNoFim` para reaproveitar a leitura do fim
      // do período em vez de refazê-la (ACHADO 7), e o próprio corpo dela é
      // à prova de falha: um erro na RPC as-of vira `console.error` + `undefined`
      // em vez de derrubar este `Promise.all` inteiro (ACHADO 3) — devolve
      // `undefined` também quando o período não junta pontos suficientes, e aí o
      // campo nem existe no snapshot.
      getSerieEstado(client, filialId, periodo, estadoNoFim),
      // F33 — a lista de filiais entra AQUI, e não num `await` antes daqui. Ela só
      // é consumida depois (é o `filiaisNome` que `manutencaoDeEstado` recebe), e
      // esperá-la lá em cima adiava o motor inteiro do relatório — as dez leituras
      // mais caras da tela — por causa de um select de seis linhas.
      //
      // ⚠ E entra DENTRO do array, não como promise guardada numa variável. A
      // diferença não é de estilo: se ela ficasse de fora e o `Promise.all` acima
      // rejeitasse primeiro, a função sairia por exceção antes de esperá-la, e uma
      // rejeição dela (mesma causa-raiz — é o MESMO client) ficaria sem handler.
      // Rejeição não tratada derruba o processo no Node, e numa função serverless
      // isso alcança as requisições CONCORRENTES da mesma instância, não só esta.
      // Dentro do array, o próprio `Promise.all` é o handler. É também a diferença
      // para o `estadoNoFim` acima, que parece o mesmo padrão mas é membro daqui.
      listarFiliais(client),
    ])

  const filiaisNome = new Map(filiais.map((f) => [f.id, f.nome]))

  const [reservados, manutencao] = await Promise.all([
    reservadosDeEstado(client, estado, periodo.ate),
    manutencaoDeEstado(client, estado, filialId, periodo, filiaisNome),
  ])

  // F16/T6 — chip "Manutenção parada (30+ dias)" derivado do próprio array de
  // manutenção (sem tocar v_pendencias). Só para o operador (incluirPendencias):
  // Pendências é assunto interno da TI; o viewer por senha não vê a seção. A5/F6A.
  const chipManutParada = incluirPendencias ? chipManutencaoParada(manutencao) : null
  const pendenciasFinais = chipManutParada ? [...pendencias, chipManutParada] : pendencias

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
    // Campo OPCIONAL: `undefined` some do JSON no `JSON.stringify` do jsonb, então
    // um snapshot sem pontos suficientes fica com a MESMA forma dos gerados antes
    // desta fase — nada de `"serieEstado": null` para o render ter de tratar.
    ...(serieEstado ? { serieEstado } : {}),
    porMotivo,
    grupos,
    pendencias: pendenciasFinais,
    saidas: tabelas.saidas,
    entradas: tabelas.entradas,
    transferencias: tabelas.transferencias,
    movimentacoesItens: movsItens,
    resumo,
  }
}
