import { GRUPO_ITEM_META } from '@/lib/dominio'
import { formatDate } from '@/lib/format'
import type { GranularidadeSerie, SnapshotRelatorioV2 } from '@/lib/relatorios/tipos'
import { CardRelatorio } from '@/components/relatorios/card-relatorio'
import { KpiTiles, GrupoKpis, type LinksKpi } from '@/components/relatorios/kpi-tiles'
import { GraficoMovSerie } from '@/components/relatorios/grafico-mov-serie'
import { BarrasHorizontais } from '@/components/relatorios/barras-horizontais'
import { BarrasEmpilhadas } from '@/components/relatorios/barras-empilhadas'
import { BarrasDivergentes } from '@/components/relatorios/barras-divergentes'
import { ListaModeloCategoria } from '@/components/relatorios/lista-modelo-categoria'
import { ListaReservados } from '@/components/relatorios/lista-reservados'
import { ManutencaoCasos } from '@/components/relatorios/manutencao-casos'
import { TabelaItensGrupo } from '@/components/relatorios/tabela-itens-grupo'
import { TabelaSaidas } from '@/components/relatorios/tabela-saidas'
import { TabelaEntradas } from '@/components/relatorios/tabela-entradas'
import { TabelaTransferencias } from '@/components/relatorios/tabela-transferencias'
import { TabelaMovItens } from '@/components/relatorios/tabela-mov-itens'
import { PendenciasChips } from '@/components/relatorios/pendencias-chips'
import { ResumoPeriodoCard } from '@/components/relatorios/resumo-periodo'
import { ObservacaoCard } from '@/components/relatorios/observacao-card'
import { ChipsAncora } from '@/components/relatorios/chips-ancora'
import { GrupoColapsavel } from '@/components/relatorios/grupo-colapsavel'

const SUBTITULO_SERIE: Record<GranularidadeSerie, string> = {
  dia: 'saídas × devoluções por dia',
  semana: 'saídas × devoluções por semana',
  mes: 'saídas × devoluções por mês',
}

function Frescor({ data }: { data: string | null }) {
  return (
    <p className="pt-1 text-xs text-muted-foreground">
      {data ? `Último lançamento em ${formatDate(data)}.` : 'Sem lançamentos registrados no período.'}
    </p>
  )
}

// Relatório v2 no formato do e-mail (F3B §4): 3 grupos + tabelas detalhadas. A
// MESMA grade serve a página ao vivo e o snapshot congelado.
export function CorpoRelatorioV2({
  snapshot,
  ehOperador = false,
  links,
}: {
  snapshot: SnapshotRelatorioV2
  ehOperador?: boolean
  links?: LinksKpi
}) {
  const s = snapshot
  const serie = s.serieMovimentacoes
  const temMov = serie.pontos.some((p) => p.saidas > 0 || p.devolucoes > 0)
  const acessorios = s.grupos.find((g) => g.grupo === 'acessorio')
  const componentes = s.grupos.find((g) => g.grupo === 'componente')

  return (
    <div className="space-y-4">
      <ChipsAncora
        temTransferencias={s.transferencias.length > 0}
        temMovItens={(s.movimentacoesItens?.length ?? 0) > 0}
      />

      {/* 1. KPIs gerais + série */}
      <KpiTiles kpis={s.kpis} anterior={s.kpisAnterior} links={links} />

      <CardRelatorio
        wide
        titulo="Movimentações"
        subtitulo={SUBTITULO_SERIE[serie.granularidade]}
        vazio={!temMov}
      >
        <GraficoMovSerie serie={serie} />
      </CardRelatorio>

      {/* 2. GRUPO — Equipamentos principais */}
      <GrupoColapsavel
        id="principais"
        titulo="Equipamentos principais"
        descricao="notebooks, desktops, monitores, celulares, tablets"
        sempreAberto
      >
        <GrupoKpis kpis={s.kpis} anterior={s.kpisAnterior} links={links} />

        <div className="rel-print-cols grid gap-3.5 md:grid-cols-2">
          <CardRelatorio
            wide
            titulo="Estoque no último dia"
            subtitulo="por categoria e situação"
            vazio={s.estoqueCatStatus.length === 0}
          >
            <BarrasEmpilhadas dados={s.estoqueCatStatus} />
          </CardRelatorio>

          <CardRelatorio
            titulo="Disponíveis por modelo"
            subtitulo={`${(s.kpis.em_estoque ?? 0).toLocaleString('pt-BR')} em estoque — a lista do e-mail`}
            vazio={s.disponiveisPorModelo.length === 0}
          >
            <ListaModeloCategoria grupos={s.disponiveisPorModelo} />
          </CardRelatorio>

          <CardRelatorio
            titulo="Reservados"
            subtitulo="patrimônio · modelo · nº do chamado"
            vazio={s.reservados.length === 0}
          >
            <ListaReservados itens={s.reservados} />
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
            titulo="Devoluções por motivo"
            subtitulo="no período"
            vazio={s.porMotivo.devolucoes.length === 0}
          >
            <BarrasHorizontais
              dados={s.porMotivo.devolucoes.map((m) => ({ rotulo: m.motivo, total: m.total }))}
              cor="var(--color-brand-azul)"
            />
          </CardRelatorio>

          <CardRelatorio
            wide
            titulo="Em manutenção, caso a caso"
            subtitulo={`${s.manutencao.length.toLocaleString('pt-BR')} caso(s) — envio, anotações e retorno`}
            vazio={s.manutencao.length === 0}
          >
            <ManutencaoCasos casos={s.manutencao} ehOperador={ehOperador} />
          </CardRelatorio>
        </div>
      </GrupoColapsavel>

      {/* 3. GRUPO — Acessórios e periféricos */}
      {acessorios && (
        <GrupoColapsavel
          id="acessorios"
          titulo={GRUPO_ITEM_META.acessorio.titulo}
          descricao="fone, mochila, teclado, mouse, hub, carregadores…"
        >
          <div className="rel-print-cols grid gap-3.5 lg:grid-cols-2">
            <CardRelatorio titulo="Saldo por item" subtitulo="total · estoque · atrelados · Δ · falta">
              <TabelaItensGrupo itens={acessorios.itens} mostrarAtrelados />
            </CardRelatorio>
            <CardRelatorio titulo="Movimentação por item" subtitulo="entradas × saídas no período">
              <BarrasDivergentes itens={acessorios.itens} />
            </CardRelatorio>
          </div>
          <Frescor data={acessorios.ultimoLancamento} />
        </GrupoColapsavel>
      )}

      {/* 4. GRUPO — Componentes */}
      {componentes && (
        <GrupoColapsavel
          id="componentes"
          titulo={GRUPO_ITEM_META.componente.titulo}
          descricao="SSD, memórias por DDR e tamanho…"
        >
          <div className="rel-print-cols grid gap-3.5 lg:grid-cols-2">
            <CardRelatorio titulo="Saldo por item" subtitulo="total · estoque · Δ · falta">
              <TabelaItensGrupo itens={componentes.itens} mostrarAtrelados={componentes.temAtrelados} />
            </CardRelatorio>
            <CardRelatorio titulo="Movimentação por item" subtitulo="entradas × saídas no período">
              <BarrasDivergentes itens={componentes.itens} />
            </CardRelatorio>
          </div>
          <Frescor data={componentes.ultimoLancamento} />
        </GrupoColapsavel>
      )}

      {/* 5. Pendências — assunto interno da TI: só o operador vê (A5/F6A) */}
      {ehOperador && s.pendencias.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">Pendências</h2>
          <PendenciasChips pendencias={s.pendencias} />
        </section>
      )}

      {/* 6–7. Tabelas detalhadas */}
      <TabelaSaidas rows={s.saidas} ehGeral={s.meta.ehGeral} ehOperador={ehOperador} />
      <TabelaEntradas rows={s.entradas} ehGeral={s.meta.ehGeral} ehOperador={ehOperador} />
      <TabelaTransferencias rows={s.transferencias} ehOperador={ehOperador} />

      {/* 8. Movimentações de itens por quantidade (B5 — seção própria) */}
      <TabelaMovItens rows={s.movimentacoesItens} ehGeral={s.meta.ehGeral} />

      {/* 9. Resumo no formato do e-mail */}
      <CardRelatorio wide titulo="Resumo do período" subtitulo="no formato do e-mail semanal">
        <ResumoPeriodoCard resumo={s.resumo} />
      </CardRelatorio>

      {/* 10. Observação da semana (B4 — só quando gravada no ato de gerar) */}
      <ObservacaoCard texto={s.meta.observacao} />
    </div>
  )
}
