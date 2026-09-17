import { rotuloCategoria } from '@/lib/dominio'
import type {
  AnySnapshot,
  GranularidadeSerie,
  SerieMovimentacoes,
  SnapshotRelatorio,
} from '@/lib/relatorios/tipos'
import { ehSnapshotV2 } from '@/lib/relatorios/tipos'
import { CardRelatorio } from '@/components/relatorios/card-relatorio'
import { KpiTiles, type LinksKpi } from '@/components/relatorios/kpi-tiles'
import { PendenciasChips } from '@/components/relatorios/pendencias-chips'
import { GraficoMovSerie } from '@/components/relatorios/grafico-mov-serie'
import { BarrasHorizontais } from '@/components/relatorios/barras-horizontais'
import { ListaModelo } from '@/components/relatorios/lista-modelo'
import { ListaManutencao } from '@/components/relatorios/lista-manutencao'
import { ListaReservados } from '@/components/relatorios/lista-reservados'
import { TabelaMovimentacoes } from '@/components/relatorios/tabela-movimentacoes'
import { ResumoPeriodoCard } from '@/components/relatorios/resumo-periodo'
import { CorpoRelatorioV2 } from '@/components/relatorios/corpo-relatorio-v2'
import type { MapaRotulosTipo } from '@/lib/itens/rotulo-tipo'

const MESES_ABREV_COMPAT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

const SUBTITULO_SERIE: Record<GranularidadeSerie, string> = {
  dia: 'saídas × devoluções por dia',
  semana: 'saídas × devoluções por semana',
  mes: 'saídas × devoluções por mês',
}

// Normaliza a série do gráfico: snapshots novos trazem `serieMovimentacoes`;
// os antigos só têm `movimentacoesPorMes` (mensal) — reconstrói a série a partir
// dele para o relatório congelado antigo continuar abrindo (compat).
function serieDoSnapshot(s: SnapshotRelatorio): SerieMovimentacoes {
  if (s.serieMovimentacoes) return s.serieMovimentacoes
  const mensal = s.movimentacoesPorMes ?? []
  const multiAno = new Set(mensal.map((p) => p.mes.slice(0, 4))).size > 1
  return {
    granularidade: 'mes',
    pontos: mensal.map((p) => {
      const [ano, m] = p.mes.split('-')
      const nome = MESES_ABREV_COMPAT[Number(m) - 1] ?? p.mes
      return {
        chave: p.mes,
        rotulo: multiAno ? `${nome}/${ano.slice(2)}` : nome,
        saidas: p.saidas,
        devolucoes: p.devolucoes,
      }
    }),
  }
}

// Ponto de entrada do relatório: despacha v2 (formato do e-mail — F3B) ou v1
// (grade da F3, para snapshots antigos que continuam abrindo — 3.10.2).
// `ehOperador` (default seguro `false`): pendência é assunto interno da TI — o
// viewer por senha não vê a seção Pendências em lugar nenhum (A5/F6A). Quem
// esquecer de passar a flag ESCONDE, não vaza.
// F16/T4 — `links` (destinos dos KPI tiles) só chega no relatório AO VIVO para o
// operador; o snapshot congelado e o viewer não recebem (a página não os monta). V1
// (snapshots antigos) NÃO repassa `links` — segue sem tiles clicáveis.
// F32/RV-05 — `aoVivo` só desce para o v2. O v1 existe para reabrir snapshots
// gerados antes do F3B: ele é congelado por definição, nunca "ao vivo", e por isso
// nem recebe a prop — a grade dele fica idêntica à de antes desta fase.
export function CorpoRelatorio({
  snapshot,
  ehOperador = false,
  links,
  recorteFilial,
  rotulosTipo,
  aoVivo = false,
}: {
  snapshot: AnySnapshot
  ehOperador?: boolean
  links?: LinksKpi
  recorteFilial?: string
  /** F39 — o vocabulário dos itens faltantes (`tipos_item`), lido no servidor
   *  com o client RESOLVIDO e descido por prop até `TabelaEntradas`. O
   *  visualizador por SENHA roda com o client administrativo: uma leitura feita
   *  com a sessão comum devolveria vazio para ele, e o relatório impresso sairia
   *  com o slug cru. Só o v2 tem tabela de Entradas — o v1 (snapshots pré-F3B)
   *  não a recebe. */
  rotulosTipo: MapaRotulosTipo
  aoVivo?: boolean
}) {
  if (ehSnapshotV2(snapshot)) {
    return (
      <CorpoRelatorioV2
        snapshot={snapshot}
        ehOperador={ehOperador}
        links={links}
        recorteFilial={recorteFilial}
        rotulosTipo={rotulosTipo}
        aoVivo={aoVivo}
      />
    )
  }
  return <CorpoRelatorioV1 snapshot={snapshot} ehOperador={ehOperador} />
}

// Grade da F3 (v1) — usada só para reabrir snapshots gerados antes do F3B.
function CorpoRelatorioV1({
  snapshot,
  ehOperador,
}: {
  snapshot: SnapshotRelatorio
  ehOperador: boolean
}) {
  const s = snapshot
  const serieMov = serieDoSnapshot(s)
  const temMovimentacao = serieMov.pontos.some((p) => p.saidas > 0 || p.devolucoes > 0)
  return (
    <div className="space-y-4">
      <KpiTiles kpis={s.kpis} />

      {ehOperador && <PendenciasChips pendencias={s.pendencias} />}

      <div className="rel-print-cols grid gap-4 md:grid-cols-2">
        <CardRelatorio
          wide
          titulo="Movimentações"
          subtitulo={SUBTITULO_SERIE[serieMov.granularidade]}
          vazio={!temMovimentacao}
        >
          <GraficoMovSerie serie={serieMov} />
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
            cor="var(--color-brand-azul)"
          />
        </CardRelatorio>

        <CardRelatorio
          titulo="Saídas por motivo"
          subtitulo="no período"
          vazio={s.porMotivo.saidas.length === 0}
        >
          <BarrasHorizontais
            dados={s.porMotivo.saidas.map((m) => ({ rotulo: m.motivo, total: m.total }))}
            cor="var(--color-brand-amarelo)"
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
            cor="var(--color-brand-azul)"
          />
        </CardRelatorio>

        <CardRelatorio wide titulo="Últimas movimentações">
          <TabelaMovimentacoes rows={s.ultimasMovimentacoes} filtrosInternos ehGeral={s.meta.ehGeral} />
        </CardRelatorio>

        <CardRelatorio
          wide
          titulo="Resumo do período"
          subtitulo="no formato do e-mail semanal"
        >
          {/* F29/REL-08 — os extras valem também aqui, e não só no corpo v2 (achado
              da revisão adversarial).
              F34/A — `disponiveis` saiu do extra (revogação parcial da REL-08:
              o bloco "Em estoque (N)" não é mais emitido no texto copiado — ver
              comentário em lib/relatorios/resumo.ts). Só `kpis` continua sendo
              repassado; `s.disponiveisPorModelo` permanece intocado como dado do
              CARD "Disponíveis por modelo" logo acima, que não usa este componente. */}
          <ResumoPeriodoCard resumo={s.resumo} extras={{ kpis: s.kpis }} />
        </CardRelatorio>
      </div>
    </div>
  )
}
