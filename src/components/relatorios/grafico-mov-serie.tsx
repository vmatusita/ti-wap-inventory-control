'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  Text,
  XAxis,
  YAxis,
  type BarShapeProps,
  type XAxisTickContentProps,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { mostrarRotulosDaSerie } from '@/lib/relatorios/rotulo-grafico'
import {
  ehBaldeDeHoje,
  ehFimDeSemana,
  OPACIDADE_BALDE_PARCIAL,
} from '@/lib/relatorios/calendario-serie'
import { hojeISO } from '@/lib/format'
import type { SerieMovimentacoes } from '@/lib/relatorios/tipos'

// Movimentações no período — barras agrupadas saídas (amarelo) × devoluções
// (azul), rótulo de valor em cima de cada barra, legenda com totais. A
// granularidade (dia/semana/mês) já vem resolvida na série; aqui o gráfico só
// desenha os `rotulo` prontos. Cores da marca WAP via token (OS-F3 3.3.2).
const config = {
  saidas: { label: 'Saídas', color: 'var(--color-brand-amarelo)' },
  devolucoes: { label: 'Devoluções', color: 'var(--color-brand-azul)' },
} satisfies ChartConfig

// LabelList do Recharts entrega o valor bruto; escondemos o zero.
function rotuloValor(v: unknown): string {
  const n = Number(v)
  return n > 0 ? String(n) : ''
}

type PontoGrafico = { chave: string; rotulo: string; saidas: number; devolucoes: number }

export function GraficoMovSerie({
  serie,
  aoVivo,
}: {
  serie: SerieMovimentacoes
  // F32/RV-05 — a marca de "hoje" (balde parcial) só é válida no relatório AO
  // VIVO: o snapshot é congelado, e se o componente chamasse `hojeISO()`
  // sozinho aqui dentro, o MESMO snapshot desenharia o selo "parcial" no dia em
  // que foi gerado e o perderia no dia seguinte — renderizaria diferente com o
  // tempo, o que quebra a promessa do congelamento. A decisão entra de fora,
  // pela rota; sem a prop (chamadas antigas, snapshot), nada muda — o v1
  // continua idêntico. Fim de semana não depende disso (é fato de calendário,
  // não "hoje") e por isso não é gateado por `aoVivo`.
  aoVivo?: boolean
}) {
  const data: PontoGrafico[] = serie.pontos.map((p) => ({
    chave: p.chave,
    rotulo: p.rotulo,
    saidas: p.saidas,
    devolucoes: p.devolucoes,
  }))
  const totalSaidas = serie.pontos.reduce((s, p) => s + p.saidas, 0)
  const totalDev = serie.pontos.reduce((s, p) => s + p.devolucoes, 0)
  // F29/REL-06b — em período longo (preset "Este ano" com balde diário) o rótulo em
  // cima de TODA barra vira uma tarja de números sobrepostos. Acima do teto os
  // rótulos somem e entra um eixo Y enxuto — a régua que o mockup previa. O valor
  // exato continua no tooltip, que este gráfico sempre teve.
  const comRotulos = mostrarRotulosDaSerie(serie.pontos.length)

  const hoje = aoVivo ? hojeISO() : null
  const ehDiario = serie.granularidade === 'dia'
  const temBaldeHoje =
    hoje !== null && data.some((p) => ehBaldeDeHoje(p.chave, serie.granularidade, hoje))

  // Opacidade por barra: o balde de hoje ainda está enchendo — compará-lo
  // cheio ao lado de dias fechados engana o leitor (ver a prop `aoVivo`
  // acima). `<Cell>` está DEPRECIADO no Recharts v3 (remoção anunciada na
  // v4.0 — JSDoc do próprio pacote instalado, node_modules/recharts/.../
  // component/Cell.tsx); a doc atual recomenda o prop `shape`, que já recebe
  // x/y/width/height/fill/stroke/radius PRONTOS do `<Bar>` — só a opacidade
  // muda, o resto (stroke/strokeWidth do RV-03) segue intacto.
  function formaBarraComOpacidade(props: BarShapeProps) {
    const ponto = props.payload as PontoGrafico | undefined
    const parcial =
      hoje !== null &&
      ponto !== undefined &&
      ehBaldeDeHoje(ponto.chave, serie.granularidade, hoje)
    return <Rectangle {...props} fillOpacity={parcial ? OPACIDADE_BALDE_PARCIAL : 1} />
  }

  // Tick do eixo em granularidade DIA: sábado/domingo saem atenuados — aviso
  // PERSISTENTE (a régua da fase é "nada só em hover"), não depende de
  // `aoVivo` porque fim de semana é fato de calendário, não "hoje". Reproduz
  // o tick padrão do Recharts (mesmo <Text>, mesmos props recebidos — ver
  // node_modules/recharts/.../cartesian/CartesianAxis.js) e só acrescenta
  // `opacity`: escrever a geometria do zero arrisca destoar do resto do eixo,
  // e `interval="preserveStartEnd"` mede a largura renderizada para decidir
  // quantos ticks cabem — reaproveitar o `<Text>` oficial mantém essa conta
  // igual à de antes. `payload.index` é o índice ORIGINAL no domínio da
  // categoria (o `index` de fora é a posição no subconjunto já filtrado pelo
  // `interval` — os dois divergem sempre que algum tick é escondido).
  function tickComFimDeSemana(props: XAxisTickContentProps) {
    const chave = data[props.payload.index]?.chave ?? ''
    const atenuado = ehFimDeSemana(chave)
    return (
      <Text {...props} fontSize={11} opacity={atenuado ? 0.6 : 1}>
        {String(props.payload.value)}
      </Text>
    )
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-4 text-xs text-foreground/70">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-brand-amarelo)' }} />
          Saídas ({totalSaidas.toLocaleString('pt-BR')})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-brand-azul)' }} />
          Devoluções ({totalDev.toLocaleString('pt-BR')})
        </span>
        {temBaldeHoje && (
          // Texto, não só opacidade — a régua da fase é "nada novo só em
          // hover" — e sem `print:hidden`: o papel também precisa saber que o
          // último dia é parcial.
          <span className="text-muted-foreground">hoje, parcial</span>
        )}
      </div>
      <ChartContainer
        config={config}
        className="aspect-[3/2] w-full sm:aspect-[2/1] md:aspect-[16/6]"
      >
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="rotulo"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={16}
            tick={ehDiario ? tickComFimDeSemana : { fontSize: 11 }}
          />
          {!comRotulos && (
            <YAxis
              width={30}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={{ fontSize: 11 }}
            />
          )}
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {/* F32/RV-03 — 2px de respiro na cor da superfície entre as barras do
              par. Aqui elas não se empilham, mas em balde apertado (preset longo,
              eixo com muitos pontos) os dois retângulos encostam e o par
              amarelo/azul vira um bloco só; a fresta devolve a leitura do par —
              e é o único separador que sobra na impressão P&B. */}
          <Bar
            dataKey="saidas"
            fill="var(--color-saidas)"
            radius={[4, 4, 0, 0]}
            stroke="var(--card)"
            strokeWidth={2}
            shape={formaBarraComOpacidade}
          >
            {comRotulos && (
              <LabelList
                dataKey="saidas"
                position="top"
                offset={6}
                className="fill-foreground"
                fontSize={10}
                formatter={rotuloValor}
              />
            )}
          </Bar>
          <Bar
            dataKey="devolucoes"
            fill="var(--color-devolucoes)"
            radius={[4, 4, 0, 0]}
            stroke="var(--card)"
            strokeWidth={2}
            shape={formaBarraComOpacidade}
          >
            {comRotulos && (
              <LabelList
                dataKey="devolucoes"
                position="top"
                offset={6}
                className="fill-foreground"
                fontSize={10}
                formatter={rotuloValor}
              />
            )}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
