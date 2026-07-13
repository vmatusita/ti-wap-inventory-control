import { rotuloCategoria } from '@/lib/dominio'
import type { MovimentacaoRelatorio, SnapshotRelatorio } from '@/lib/relatorios/tipos'
import { CardRelatorio } from '@/components/relatorios/card-relatorio'
import { KpiTiles } from '@/components/relatorios/kpi-tiles'
import { PendenciasChips } from '@/components/relatorios/pendencias-chips'
import { GraficoMovMes } from '@/components/relatorios/grafico-mov-mes'
import { BarrasHorizontais } from '@/components/relatorios/barras-horizontais'
import { ListaModelo } from '@/components/relatorios/lista-modelo'
import { ListaManutencao } from '@/components/relatorios/lista-manutencao'
import { ListaReservados } from '@/components/relatorios/lista-reservados'
import { TabelaMovimentacoes } from '@/components/relatorios/tabela-movimentacoes'
import { ResumoPeriodoCard } from '@/components/relatorios/resumo-periodo'

// Grade de cards do relatório — a MESMA para a página ao vivo e o snapshot
// gerado (OS-F3 3.8.5). Recebe o SnapshotRelatorio por props; só a tabela de
// movimentações muda de comportamento (filtros internos + export offline no
// snapshot; export do período inteiro via Server Action no ao vivo).
export function CorpoRelatorio({
  snapshot,
  nomeArquivoCsv,
  filtrosInternos = false,
  carregarExport,
}: {
  snapshot: SnapshotRelatorio
  nomeArquivoCsv: string
  filtrosInternos?: boolean
  carregarExport?: () => Promise<MovimentacaoRelatorio[]>
}) {
  const s = snapshot
  return (
    <div className="space-y-3.5">
      <KpiTiles kpis={s.kpis} />

      <PendenciasChips pendencias={s.pendencias} />

      <div className="rel-print-cols grid gap-3.5 md:grid-cols-2">
        <CardRelatorio
          wide
          titulo="Movimentações por mês"
          subtitulo="saídas × devoluções no período"
          vazio={s.movimentacoesPorMes.length === 0}
        >
          <GraficoMovMes dados={s.movimentacoesPorMes} />
        </CardRelatorio>

        <CardRelatorio
          titulo="Ativos por categoria"
          subtitulo="inventário atual"
          vazio={s.estoquePorCategoria.length === 0}
        >
          <BarrasHorizontais
            dados={s.estoquePorCategoria.map((c) => ({
              rotulo: rotuloCategoria(c.categoria),
              total: c.total,
            }))}
            cor="#2a78d6"
          />
        </CardRelatorio>

        <CardRelatorio
          titulo="Saídas por motivo"
          subtitulo="no período"
          vazio={s.porMotivo.saidas.length === 0}
        >
          <BarrasHorizontais
            dados={s.porMotivo.saidas.map((m) => ({ rotulo: m.motivo, total: m.total }))}
            cor="#eda100"
          />
        </CardRelatorio>

        <CardRelatorio
          titulo="Disponíveis por modelo"
          subtitulo={`${s.kpis.em_estoque.toLocaleString('pt-BR')} em estoque — a lista do e-mail`}
          vazio={s.disponiveisPorModelo.length === 0}
        >
          <ListaModelo itens={s.disponiveisPorModelo} />
        </CardRelatorio>

        <CardRelatorio
          titulo="Em manutenção, caso a caso"
          subtitulo={`${s.emManutencao.length.toLocaleString('pt-BR')} unidades`}
          vazio={s.emManutencao.length === 0}
        >
          <ListaManutencao itens={s.emManutencao} />
        </CardRelatorio>

        <CardRelatorio
          titulo="Reservados"
          subtitulo="patrimônio · modelo · nº do chamado"
          vazio={s.reservados.length === 0}
        >
          <ListaReservados itens={s.reservados} />
        </CardRelatorio>

        <CardRelatorio
          titulo="Devoluções por motivo"
          subtitulo="no período"
          vazio={s.porMotivo.devolucoes.length === 0}
        >
          <BarrasHorizontais
            dados={s.porMotivo.devolucoes.map((m) => ({ rotulo: m.motivo, total: m.total }))}
            cor="#2a78d6"
          />
        </CardRelatorio>

        <CardRelatorio wide titulo="Últimas movimentações">
          <TabelaMovimentacoes
            rows={s.ultimasMovimentacoes}
            nomeArquivo={nomeArquivoCsv}
            filtrosInternos={filtrosInternos}
            ehGeral={s.meta.ehGeral}
            carregarExport={carregarExport}
          />
        </CardRelatorio>

        <CardRelatorio
          wide
          titulo="Resumo do período"
          subtitulo="no formato do e-mail semanal"
        >
          <ResumoPeriodoCard resumo={s.resumo} />
        </CardRelatorio>
      </div>
    </div>
  )
}
