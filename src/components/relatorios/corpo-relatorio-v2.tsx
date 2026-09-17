import { GRUPO_ITEM_META } from '@/lib/dominio'
import { formatDate } from '@/lib/format'
import type { GranularidadeSerie, SnapshotRelatorioV2 } from '@/lib/relatorios/tipos'
import { agregarAcervoPorSituacao } from '@/lib/relatorios/acervo'
import { resumoRiscoManutencao } from '@/lib/relatorios/resumo-manutencao'
import { totalDaTabela } from '@/lib/relatorios/teto-tabela'
import { MAX_PONTOS_SERIE_ESTADO, MAX_SEMANAS_SERIE_ESTADO } from '@/lib/relatorios/serie-estado'
import { recorteParaSegmento } from '@/lib/relatorios/cliques-grafico'
import { CardRelatorio } from '@/components/relatorios/card-relatorio'
import { BarraAcervo } from '@/components/relatorios/barra-acervo'
import { SerieEstadoGrafico } from '@/components/relatorios/serie-estado-grafico'
import { PREFIXO_FILTROS } from '@/lib/relatorios/prefixos-tabela'
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
import type { MapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import { GrupoColapsavel } from '@/components/relatorios/grupo-colapsavel'
import {
  GlossarioRelatorio,
  LegendaDelta,
  LegendaManutencao,
} from '@/components/relatorios/legendas'

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
  recorteFilial,
  rotulosTipo,
  aoVivo = false,
}: {
  snapshot: SnapshotRelatorioV2
  ehOperador?: boolean
  links?: LinksKpi
  /** F32/RV-12 — o fragmento `&filial=<id>`/`&filial=todas` que o clique num
   *  segmento das empilhadas usa para montar o destino em `/ativos`. Só a rota ao
   *  vivo o monta, e só para o operador — o mesmo regime de `links`. */
  recorteFilial?: string
  /** F32/RV-05 — "este relatório está sendo derivado agora", que é DIFERENTE de
   *  "quem olha é operador" (`links`): a rota ao vivo serve os dois públicos. Só
   *  ela passa `true`; o snapshot congelado nunca passa, e é isso que impede a
   *  marca de balde parcial de aparecer hoje e sumir amanhã no MESMO snapshot. */
  /** F39 — o vocabulário dos itens faltantes (`tipos_item`), lido no servidor
   *  com o client RESOLVIDO e descido por prop até `TabelaEntradas`. O
   *  visualizador por SENHA roda com o client administrativo: uma leitura feita
   *  com a sessão comum devolveria vazio para ele, e o relatório impresso sairia
   *  com o slug cru. Só o v2 tem tabela de Entradas — o v1 (snapshots pré-F3B)
   *  não a recebe. */
  rotulosTipo: MapaRotulosTipo
  aoVivo?: boolean
}) {
  const s = snapshot
  // F29/REL-07 — o período vem do META congelado, não de `hoje`: no snapshot a
  // janela de comparação do Δ tem de ser a do dia em que ele foi gerado.
  const periodo = { de: s.meta.de, ate: s.meta.ate }
  const serie = s.serieMovimentacoes
  const temMov = serie.pontos.some((p) => p.saidas > 0 || p.devolucoes > 0)
  const acessorios = s.grupos.find((g) => g.grupo === 'acessorio')
  const componentes = s.grupos.find((g) => g.grupo === 'componente')
  // F32/RV-07 — derivado em memória do que o snapshot já tem. Vale igual no ao
  // vivo e no snapshot v2 (inclusive nos gerados antes da F32).
  const acervo = agregarAcervoPorSituacao(s.estoqueCatStatus)

  return (
    <div className="space-y-4">
      {/* F32/RV-13+RV-14 — os chips passaram a dizer quanto tem em cada seção
          (responde "vale rolar até lá?" ANTES do gesto) e qual seção está na
          tela (scroll-spy por IntersectionObserver). Os números já estavam todos
          no snapshot: nenhuma leitura nova.
          F60 — o número das três tabelas é o do TÍTULO da seção (`totalDaTabela`): com corte no
          teto, o total exato do período, nunca o tamanho da lista cortada. O chip que dissesse
          "Saídas · 2.000" levaria a uma seção que diz "2.412 no período". */}
      <ChipsAncora
        contagens={{
          acessorios: acessorios?.itens.length,
          componentes: componentes?.itens.length,
          saidas: totalDaTabela(s.saidas, s.tabelasTruncadas?.saidas),
          entradas: totalDaTabela(s.entradas, s.tabelasTruncadas?.entradas),
          transferencias: totalDaTabela(s.transferencias, s.tabelasTruncadas?.transferencias),
          movItens: s.movimentacoesItens?.length ?? 0,
          temObservacao: Boolean(s.meta.observacao && s.meta.observacao.trim()),
        }}
      />

      {/* 1. KPIs gerais + série */}
      <KpiTiles
        kpis={s.kpis}
        anterior={s.kpisAnterior}
        links={links}
        periodo={periodo}
      />
      {/* B1/F17 — o snapshot v2 sempre tem kpisAnterior, então o Δ (e sua legenda)
          sempre aparecem aqui; o dashboard e os snapshots v1 usam KpiTiles sem
          `anterior` (sem Δ) e não passam por este corpo. */}
      <LegendaDelta />

      {/* 1b. O sumário de uma linha (F32/RV-07). Fica ENTRE os tiles e o resto
          porque é exatamente o elo entre os dois: os tiles dizem quanto tem de
          cada situação, esta barra mostra a proporção entre elas, e as empilhadas
          logo abaixo repetem o mesmo vocabulário de cor por categoria. */}
      {/* F32/RV-04 — daqui em diante cada card declara a JANELA que ele enxerga:
          `foto` = estado reconstruído no último dia (as-of), `periodo` = o que
          aconteceu no intervalo. A confusão nº 1 de quem lê relatório de estoque é
          somar as duas coisas, e até aqui a distinção morava só no fraseado do
          subtítulo, diferente em cada card. O chip é o mesmo sinal, no mesmo
          lugar, com o mesmo vocabulário — depois de dois relatórios o olho o lê
          sem pensar. O glossário ganhou o verbete "Foto × período". */}
      <CardRelatorio
        wide
        titulo="Acervo por situação"
        subtitulo={`${acervo.total.toLocaleString('pt-BR')} ativos no último dia do período`}
        janela="foto"
        periodoJanela={periodo}
        vazio={acervo.segmentos.length === 0}
        vazioMsg="Sem ativos no acervo neste recorte."
      >
        <BarraAcervo acervo={acervo} />
      </CardRelatorio>

      <CardRelatorio
        wide
        titulo="Movimentações"
        subtitulo={SUBTITULO_SERIE[serie.granularidade]}
        janela="periodo"
        periodoJanela={periodo}
        vazio={!temMov}
      >
        <GraficoMovSerie serie={serie} aoVivo={aoVivo} />
      </CardRelatorio>

      {/* 2. GRUPO — Equipamentos principais */}
      {/* F32/RV-19a — o ícone dá três marcos na rolagem de uma página longa, onde
          título de grupo e título de tabela eram tipograficamente idênticos.
          Passa-se a CHAVE, não o componente lucide: este arquivo é Server
          Component e `GrupoColapsavel` é `'use client'` — função não atravessa a
          fronteira RSC, e a primeira versão (que passava o ícone) derrubava a
          rota com 500 sem que lint, tsc ou build reclamassem. */}
      <GrupoColapsavel
        id="principais"
        titulo="Equipamentos principais"
        descricao="notebooks, desktops, monitores, celulares, tablets"
        icone="principais"
        sempreAberto
      >
        <GrupoKpis
          kpis={s.kpis}
          anterior={s.kpisAnterior}
          links={links}
          periodo={periodo}
        />

        <div className="rel-print-cols grid gap-3.5 md:grid-cols-2">
          <CardRelatorio
            wide
            titulo="Estoque no último dia"
            subtitulo="por categoria e situação"
            janela="foto"
            periodoJanela={periodo}
            vazio={s.estoqueCatStatus.length === 0}
          >
            {/* F32/RV-12b — clicar num segmento abre `/ativos` já filtrado por
                aquele status E aquela categoria. `recorteFilial` só chega no ao
                vivo para o operador: ausente, o gráfico é o estático de sempre —
                é o mesmo gate dos KPI tiles desde a F16.
                `recorteParaSegmento` é a DEFESA EM PROFUNDIDADE, não repetição
                à toa: a página é quem decide, mas se um dia outra rota passar o
                recorte por engano, o clique só acende se o sinal de "operador no
                ao vivo" também tiver chegado. F32/achado-10 — antes essa defesa
                era uma expressão inline (`links ? recorteFilial : undefined`)
                que só um casamento de string no teste de confinamento provava;
                agora mora numa função pura testada em cliques-grafico.ts. */}
            <BarrasEmpilhadas
              dados={s.estoqueCatStatus}
              recorteFilial={recorteParaSegmento(Boolean(links), recorteFilial)}
            />
          </CardRelatorio>

          {/* F32/RV-06 — "Evolução do estoque": a forma que faltava. O relatório
              respondia "quanto saiu/entrou" (a série de movimentações) e "como
              está no fim" (KPIs, empilhadas), mas não "para onde a prateleira
              está indo". Um ponto por semana ENCERRADA dentro do período,
              reconstruído as-of; congelado no snapshot como campo opcional.
              O card só existe quando a régua junta pontos suficientes (ver
              lib/relatorios/serie-estado.ts) — no preset padrão de 7 dias ele
              não aparece, e snapshot gerado antes desta fase também não o tem.

              F32/achado-5 — o chip "foto × período" é o ÚNICO canal que declara
              a janela ao leitor; deixá-lo mentir era o defeito. `datasDaSerieEstado`
              corta silenciosamente para as últimas MAX_SEMANAS_SERIE_ESTADO
              semanas, então em "Este ano" a série cobre só ~2 meses — mas
              `periodoJanela={periodo}` fazia o chip anunciar o ANO INTEIRO
              ("01/01 – 10/08"), e quem lê a inclinação achava que via a
              tendência do ano. Agora o chip usa a janela REAL (primeiro e
              último ponto da série que veio no snapshot), não a do relatório;
              o subtítulo segue o mesmo raciocínio: no teto ele diz quantas
              semanas são, fora do teto continua dizendo "cada semana do
              período" porque aí as duas janelas coincidem. */}
          {s.serieEstado && s.serieEstado.pontos.length > 0 && (() => {
            const serieEstado = s.serieEstado
            const primeiro = serieEstado.pontos[0]
            const ultimo = serieEstado.pontos[serieEstado.pontos.length - 1]
            const noTeto = serieEstado.pontos.length >= MAX_PONTOS_SERIE_ESTADO
            return (
              <CardRelatorio
                wide
                titulo="Evolução do estoque"
                subtitulo={
                  noTeto
                    ? `em estoque no fim das últimas ${MAX_SEMANAS_SERIE_ESTADO} semanas do período`
                    : 'em estoque no fim de cada semana do período'
                }
                janela="periodo"
                periodoJanela={{ de: primeiro.chave, ate: ultimo.chave }}
              >
                <SerieEstadoGrafico serie={serieEstado} />
              </CardRelatorio>
            )
          })()}

          <CardRelatorio
            titulo="Disponíveis por modelo"
            subtitulo={`${(s.kpis.em_estoque ?? 0).toLocaleString('pt-BR')} em estoque — a lista do e-mail`}
            janela="foto"
            periodoJanela={periodo}
            vazio={s.disponiveisPorModelo.length === 0}
          >
            <ListaModeloCategoria grupos={s.disponiveisPorModelo} />
          </CardRelatorio>

          <CardRelatorio
            titulo="Reservados"
            subtitulo="patrimônio · modelo · nº do chamado"
            janela="foto"
            periodoJanela={periodo}
            vazio={s.reservados.length === 0}
          >
            <ListaReservados itens={s.reservados} />
          </CardRelatorio>

          <CardRelatorio
            titulo="Saídas por motivo"
            subtitulo="no período"
            janela="periodo"
            periodoJanela={periodo}
            vazio={s.porMotivo.saidas.length === 0}
          >
            {/* F32/RV-08 — "Novo colaborador: 219" não responde "de quanto?". O
                percentual é sempre sobre a soma da PRÓPRIA lista (o total de
                saídas do período), nunca um total externo.
                F32/RV-12a — e clicar na barra passa a filtrar a tabela de Saídas
                lá embaixo (o filtro já era serializável na URL desde a F13; o que
                faltava era o gráfico saber apontar para ele). */}
            <BarrasHorizontais
              dados={s.porMotivo.saidas.map((m) => ({ rotulo: m.motivo, total: m.total }))}
              cor="var(--color-brand-amarelo)"
              comPercentual
              filtroTabela={links ? { prefixo: PREFIXO_FILTROS.saidas, ancora: 'saidas' } : undefined}
            />
          </CardRelatorio>

          <CardRelatorio
            titulo="Devoluções por motivo"
            subtitulo="no período"
            janela="periodo"
            periodoJanela={periodo}
            vazio={s.porMotivo.devolucoes.length === 0}
          >
            <BarrasHorizontais
              dados={s.porMotivo.devolucoes.map((m) => ({ rotulo: m.motivo, total: m.total }))}
              cor="var(--color-brand-azul)"
              comPercentual
              filtroTabela={
                links ? { prefixo: PREFIXO_FILTROS.entradas, ancora: 'entradas' } : undefined
              }
            />
          </CardRelatorio>

          <CardRelatorio
            wide
            titulo="Em manutenção, caso a caso"
            /* F32/RV-19b — o subtítulo dizia só quantos casos existiam ("14
               caso(s) — envio, anotações e retorno"), que é a informação que o
               leitor já vê contando os cards. Agora ele dimensiona o RISCO antes
               de o leitor decidir abrir: quantos estão parados há 30+ dias e
               quantos encerraram no período. */
            subtitulo={resumoRiscoManutencao(s.manutencao)}
            janela="foto"
            periodoJanela={periodo}
            vazio={s.manutencao.length === 0}
          >
            <ManutencaoCasos casos={s.manutencao} ehOperador={ehOperador} />
            <LegendaManutencao casos={s.manutencao} />
          </CardRelatorio>
        </div>
      </GrupoColapsavel>

      {/* 3. GRUPO — Acessórios e periféricos */}
      {acessorios && (
        <GrupoColapsavel
          id="acessorios"
          titulo={GRUPO_ITEM_META.acessorio.titulo}
          descricao="fone, mochila, teclado, mouse, hub, carregadores…"
          icone="acessorios"
        >
          <div className="rel-print-cols grid gap-3.5 lg:grid-cols-2">
            <CardRelatorio
              titulo="Saldo por item"
              subtitulo="total · em estoque · reservado · Δ · falta"
              janela="foto"
              periodoJanela={periodo}
            >
              <TabelaItensGrupo itens={acessorios.itens} mostrarAtrelados />
            </CardRelatorio>
            <CardRelatorio
              titulo="Movimentação por item"
              subtitulo="entradas × saídas no período"
              janela="periodo"
              periodoJanela={periodo}
            >
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
          icone="componentes"
        >
          <div className="rel-print-cols grid gap-3.5 lg:grid-cols-2">
            <CardRelatorio
              titulo="Saldo por item"
              subtitulo="total · estoque · Δ · falta"
              janela="foto"
              periodoJanela={periodo}
            >
              <TabelaItensGrupo itens={componentes.itens} mostrarAtrelados={componentes.temAtrelados} />
            </CardRelatorio>
            <CardRelatorio
              titulo="Movimentação por item"
              subtitulo="entradas × saídas no período"
              janela="periodo"
              periodoJanela={periodo}
            >
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
          {/* F27/B5 (PND-03) — chips clicáveis só no AO VIVO para o operador:
              reusa o MESMO sinal que já decide os KPI tiles clicáveis logo
              acima (`links`, só vem preenchido em relatorios/[filial]/page.tsx
              quando `ehOperador`). O snapshot congelado (relatorios/gerados/[id])
              nunca passa `links`, então `Boolean(links)` já é `false` lá — sem
              precisar de uma segunda flag para a mesma decisão. */}
          <PendenciasChips pendencias={s.pendencias} comLink={Boolean(links)} />
        </section>
      )}

      {/* 6–7. Tabelas detalhadas. F60 — `corte` só existe para a tabela que a leitura cortou no
          teto (`tabelasTruncadas`, chave opcional da V2): ausente no volume de hoje e em todo
          snapshot anterior à F60, e aí as tabelas ficam exatamente como eram. `aoVivo` escolhe a
          frase final do aviso — encurtar o período só é conselho na rota ao vivo. */}
      <TabelaSaidas
        rows={s.saidas}
        ehGeral={s.meta.ehGeral}
        ehOperador={ehOperador}
        corte={s.tabelasTruncadas?.saidas}
        aoVivo={aoVivo}
      />
      <TabelaEntradas
        rows={s.entradas}
        ehGeral={s.meta.ehGeral}
        rotulosTipo={rotulosTipo}
        ehOperador={ehOperador}
        corte={s.tabelasTruncadas?.entradas}
        aoVivo={aoVivo}
      />
      <TabelaTransferencias
        rows={s.transferencias}
        ehGeral={s.meta.ehGeral}
        ehOperador={ehOperador}
        corte={s.tabelasTruncadas?.transferencias}
        aoVivo={aoVivo}
      />

      {/* 8. Movimentações de itens por quantidade (B5 — seção própria) */}
      <TabelaMovItens rows={s.movimentacoesItens} ehGeral={s.meta.ehGeral} />

      {/* 9. Resumo no formato do e-mail. `id` (F29/REL-09a) é o alvo do chip
          "Resumo" — a seção mais procurada não tinha permalink nem atalho na barra
          sticky. O extra (F29/REL-08) acrescenta ao texto COPIADO a linha de KPIs.
          F34/A — o bloco "Em estoque (N)" saiu do texto (revogação parcial da
          REL-08 — ver lib/relatorios/resumo.ts); com ele foram embora o campo
          `disponiveis` do extra e a função de achatamento que o alimentava (removida
          do módulo de resumo — não sobrou import morto aqui). `s.disponiveisPorModelo`
          continua intocado como dado do card "Disponíveis por modelo" logo acima,
          agrupado por categoria. */}
      <CardRelatorio
        id="resumo"
        wide
        titulo="Resumo do período"
        subtitulo="no formato do e-mail semanal"
      >
        <ResumoPeriodoCard resumo={s.resumo} extras={{ kpis: s.kpis }} />
      </CardRelatorio>

      {/* 10. Observação da semana (B4 — só quando gravada no ato de gerar) */}
      <ObservacaoCard texto={s.meta.observacao} />

      {/* 11. Como ler este relatório (F17/B4 — glossário; apêndice de referência,
          visível para operador E visualizador, no ao vivo e nos snapshots v2). */}
      <GlossarioRelatorio />
    </div>
  )
}
