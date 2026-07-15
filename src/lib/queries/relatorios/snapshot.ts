import { parseISO, format, differenceInCalendarDays, subDays } from 'date-fns'
import type { Periodo } from '@/lib/relatorios/periodo'
import type { SnapshotRelatorioV2 } from '@/lib/relatorios/tipos'
import { listarFiliais } from '@/lib/queries/filiais'
import { resolverFilialPorSlug, type DbClient } from './comum'
import {
  categoriaDeEstado,
  disponiveisPorModeloDeEstado,
  estoqueCatStatusDeEstado,
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
import { getGruposItens } from './itens'
import { getPendencias } from './pendencias'

// ===========================================================================
// RELATÓRIO v2 (formato do e-mail — F3B). Estado reconstruído AS-OF no fim do
// período (fast path quando o período termina hoje), 3 grupos, KPIs com Δ e as
// tabelas detalhadas. getSnapshotRelatorioV2 reúne as agregações dos módulos
// (estoque · movimentacoes · itens · pendencias) num objeto schema 2 — o JSON
// serializável que a geração de relatório (3.8/3.10) congela.
// ===========================================================================

// Período anterior de MESMA duração (para o Δ dos KPIs). O comparativo é o
// estado as-of do último dia do período anterior (véspera de `de`).
function periodoAnterior(periodo: Periodo): Periodo {
  const dias = differenceInCalendarDays(parseISO(periodo.ate), parseISO(periodo.de)) + 1
  const ate = format(subDays(parseISO(periodo.de), 1), 'yyyy-MM-dd')
  const de = format(subDays(parseISO(periodo.de), dias), 'yyyy-MM-dd')
  return { de, ate }
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
