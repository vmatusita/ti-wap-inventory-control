'use client'

import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
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

export function GraficoMovSerie({ serie }: { serie: SerieMovimentacoes }) {
  const data = serie.pontos.map((p) => ({
    rotulo: p.rotulo,
    saidas: p.saidas,
    devolucoes: p.devolucoes,
  }))
  const totalSaidas = serie.pontos.reduce((s, p) => s + p.saidas, 0)
  const totalDev = serie.pontos.reduce((s, p) => s + p.devolucoes, 0)

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-4 text-xs text-foreground/70">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-brand-amarelo)' }} />
          Saídas ({totalSaidas.toLocaleString('pt-BR')})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-brand-azul)' }} />
          Devoluções ({totalDev.toLocaleString('pt-BR')})
        </span>
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
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey="saidas" fill="var(--color-saidas)" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="saidas"
              position="top"
              offset={6}
              className="fill-foreground"
              fontSize={10}
              formatter={rotuloValor}
            />
          </Bar>
          <Bar dataKey="devolucoes" fill="var(--color-devolucoes)" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="devolucoes"
              position="top"
              offset={6}
              className="fill-foreground"
              fontSize={10}
              formatter={rotuloValor}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
