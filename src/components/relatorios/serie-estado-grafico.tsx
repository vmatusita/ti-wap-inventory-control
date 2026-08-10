'use client'

import { CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { CartesianViewBox, LabelProps } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { STATUS_CHART_COLOR, rotuloStatus } from '@/lib/dominio'
import type { SerieEstado } from '@/lib/relatorios/tipos'

// F32/RV-06 — "Evolução do estoque": a única forma de visualização que faltava na
// página, e a única aqui que é LINHA.
//
// Por que linha, se o resto do relatório é barra: barra serve a contagem discreta
// por balde (quantas saídas na terça); linha serve a uma grandeza CONTÍNUA
// amostrada no tempo — o estoque existe entre as amostras, e é a inclinação do
// traço que responde "a prateleira está esvaziando?". É também por isso que aqui
// não cabe empilhar nem parear: uma série, um eixo, sem eixo duplo (o anti-padrão
// que a análise §3 recusa explicitamente).
//
// A cor NÃO é o azul da marca: `em_estoque` veste a cor do STATUS (#16a34a), a
// mesma do tile, do segmento e do swatch do glossário — é a promessa da fase.
const config = {
  em_estoque: { label: rotuloStatus('em_estoque'), color: STATUS_CHART_COLOR.em_estoque },
} satisfies ChartConfig

export function SerieEstadoGrafico({ serie }: { serie: SerieEstado }) {
  const dados = serie.pontos
  const ultimoIndice = dados.length - 1

  // `domain={['dataMin', 'dataMax']}` degenera quando TODOS os pontos têm o
  // mesmo valor (filial pequena cujo estoque não mudou nas semanas do
  // período — caso comum): o domínio vira [n, n], a escala linear não tem
  // faixa pra distribuir, o eixo sai com um único tick e a curva "estável"
  // encosta na borda da área de plotagem, lendo como extremo em vez de
  // patamar. Por isso o domínio é calculado aqui e ganha um degrau de 1
  // pra cada lado quando min === max. `Math.min()`/`Math.max()` sem
  // argumento (lista vazia) devolvem Infinity/-Infinity — daí o guard.
  // O piso em 0 existe porque estoque não é negativo: um eixo começando em
  // -1 leria como erro de dado, não como folga visual.
  const valores = dados.map((p) => p.em_estoque)
  const dominio: [number, number] =
    valores.length === 0
      ? [0, 1]
      : (() => {
          const min = Math.min(...valores)
          const max = Math.max(...valores)
          return min === max ? [Math.max(0, min - 1), max + 1] : [min, max]
        })()

  // O valor do último ponto sai escrito, em TINTA (foreground), não na cor da
  // série: número na cor da linha vira decoração e some contra fundo claro; o
  // valor final é o dado mais lido do gráfico e precisa do contraste do texto
  // comum. É o mesmo princípio do total na ponta das barras empilhadas.
  function rotuloFinal(props: LabelProps) {
    if (props.index !== ultimoIndice) return <text />
    const viewBox = props.viewBox as CartesianViewBox | undefined
    if (viewBox?.x == null || viewBox?.y == null) return <text />
    return (
      <text
        x={viewBox.x}
        y={viewBox.y - 10}
        textAnchor="end"
        fontSize={12}
        className="fill-foreground font-medium"
      >
        {Number(dados[ultimoIndice]?.em_estoque ?? 0).toLocaleString('pt-BR')}
      </text>
    )
  }

  return (
    <ChartContainer
      config={config}
      className="aspect-[3/2] w-full sm:aspect-[5/2] md:aspect-[16/6]"
    >
      <LineChart data={dados} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
        {/* Grade fio-de-cabelo só na horizontal: a leitura aqui é de ALTURA (o
            nível do estoque), não de posição no eixo x. */}
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="rotulo"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11 }}
        />
        {/* O eixo Y existe aqui (ao contrário das barras, que rotulam cada marca):
            numa linha o valor de cada ponto não cabe escrito sem virar tarja, e
            sem eixo o leitor perde a escala. `domain` automático NÃO parte do
            zero de propósito — variação de estoque é o assunto, e forçar o zero
            achataria a curva a ponto de esconder justamente a tendência. A
            escolha fica registrada porque ela É uma escolha: quem quiser
            magnitude absoluta tem os KPI tiles logo acima. */}
        <YAxis
          width={38}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tick={{ fontSize: 11 }}
          domain={dominio}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Line
          dataKey="em_estoque"
          type="monotone"
          stroke={STATUS_CHART_COLOR.em_estoque}
          strokeWidth={2}
          // O anel na cor da SUPERFÍCIE destaca o ponto da própria linha e da
          // grade — mesma técnica do respiro de 2px das barras (RV-03).
          dot={{ r: 3, fill: STATUS_CHART_COLOR.em_estoque, stroke: 'var(--card)', strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
          isAnimationActive={false}
        >
          <LabelList dataKey="em_estoque" content={rotuloFinal} />
        </Line>
      </LineChart>
    </ChartContainer>
  )
}
