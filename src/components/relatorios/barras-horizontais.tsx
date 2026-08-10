'use client'

import {
  Bar,
  BarChart,
  LabelList,
  XAxis,
  YAxis,
  type CartesianViewBox,
  type LabelProps,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { useEstreito } from '@/components/relatorios/use-estreito'
import { rotuloComPercentual } from '@/lib/relatorios/percentual'

// Barras horizontais de série única com o valor à direita (OS-F3 3.3.2). Reusado
// em "Ativos por categoria", "Saídas por motivo" e "Devoluções por motivo". Cor
// única por instância (amarelo p/ saídas, azul p/ o resto).
export type BarraItem = { rotulo: string; total: number }

export function BarrasHorizontais({
  dados,
  cor,
  comPercentual = false,
}: {
  dados: BarraItem[]
  cor: string
  // F32/RV-08 — opcional e OFF por padrão: este componente também desenha
  // "Ativos por categoria" no dashboard, que não pode ganhar o "· NN%" sem
  // pedir. Ligado, o percentual é sempre contra a soma da PRÓPRIA `dados` —
  // nunca um total externo, senão "Saídas" e "Devoluções" (cada card com o
  // seu total de período) ficariam lendo a régua uma da outra.
  comPercentual?: boolean
}) {
  const estreito = useEstreito()

  const config = {
    total: { label: 'Total', color: cor },
  } satisfies ChartConfig

  // Altura proporcional ao nº de barras (cada uma ~34px), com teto mínimo.
  const altura = Math.max(90, dados.length * 34 + 8)
  const larguraEixo = estreito ? 96 : 150
  const maxRotulo = estreito ? 14 : 24
  const totalLista = dados.reduce((soma, d) => soma + d.total, 0)

  // "219 · 52%" é bem mais largo que "219": a margem direita original (34px)
  // foi calibrada só para o número. Sem alargar aqui, o `%` de itens de 3
  // dígitos vaza para fora do <svg> e o navegador o corta (overflow padrão de
  // <svg> é hidden) — por isso o alargamento vem preso ao próprio
  // `comPercentual`, nunca no caminho default.
  const margemDireita = comPercentual ? 72 : 34

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: altura }}
    >
      <BarChart
        data={dados}
        layout="vertical"
        margin={{ top: 2, right: margemDireita, bottom: 2, left: 4 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="rotulo"
          width={larguraEixo}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: estreito ? 11 : 12 }}
          tickFormatter={(v: string) =>
            v.length > maxRotulo ? `${v.slice(0, maxRotulo - 1)}…` : v
          }
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={
                comPercentual
                  ? (value) => {
                      const numero = typeof value === 'number' ? value : Number(value)
                      const { valor, percentual } = rotuloComPercentual(numero, totalLista)
                      return (
                        <div className="flex w-full flex-1 items-center justify-between gap-2 leading-none">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: cor }}
                            />
                            <span className="text-muted-foreground">{config.total.label}</span>
                          </div>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {valor}
                            {percentual !== null && (
                              <span className="text-muted-foreground"> · {percentual}</span>
                            )}
                          </span>
                        </div>
                      )
                    }
                  : undefined
              }
            />
          }
        />
        <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]}>
          {comPercentual ? (
            <LabelList
              dataKey="total"
              content={(props: LabelProps) => {
                // `viewBox` é o retângulo DESTA barra (recharts repete x/y/
                // width/height nele para cada item do LabelList — mesma forma
                // que o "content" recebe em qualquer LabelList customizada).
                // Índice fora da lista não deveria acontecer (LabelList só
                // itera sobre `dados`), mas devolver <text/> vazio em vez de
                // null mantém o tipo de retorno exigido pelo recharts.
                const viewBox = props.viewBox as CartesianViewBox | undefined
                const item = dados[props.index ?? -1]
                if (!item || viewBox?.x == null) return <text />
                const x = viewBox.x + (viewBox.width ?? 0) + 8
                const y = (viewBox.y ?? 0) + (viewBox.height ?? 0) / 2
                const { valor, percentual } = rotuloComPercentual(item.total, totalLista)
                return (
                  <text x={x} y={y} dominantBaseline="central" fontSize={12}>
                    <tspan className="fill-foreground">{valor}</tspan>
                    {percentual !== null && (
                      <tspan className="fill-muted-foreground"> · {percentual}</tspan>
                    )}
                  </text>
                )
              }}
            />
          ) : (
            <LabelList
              dataKey="total"
              position="right"
              offset={8}
              className="fill-foreground"
              fontSize={12}
            />
          )}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
