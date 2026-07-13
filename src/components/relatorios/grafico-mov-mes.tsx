'use client'

import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { PontoMes } from '@/lib/relatorios/tipos'

// Movimentações por mês — barras agrupadas saídas (#eda100) × devoluções
// (#2a78d6), rótulo de valor em cima de cada barra, legenda com totais
// (OS-F3 3.3.2). Cores fixas da paleta WAP.
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const config = {
  saidas: { label: 'Saídas', color: '#eda100' },
  devolucoes: { label: 'Devoluções', color: '#2a78d6' },
} satisfies ChartConfig

function rotuloMes(mes: string, multiAno: boolean): string {
  const [ano, m] = mes.split('-')
  const nome = MESES[Number(m) - 1] ?? mes
  return multiAno ? `${nome}/${ano.slice(2)}` : nome
}

// LabelList do Recharts entrega o valor bruto; escondemos o zero.
function rotuloValor(v: unknown): string {
  const n = Number(v)
  return n > 0 ? String(n) : ''
}

export function GraficoMovMes({ dados }: { dados: PontoMes[] }) {
  const anos = new Set(dados.map((d) => d.mes.slice(0, 4)))
  const multiAno = anos.size > 1
  const data = dados.map((d) => ({
    mes: rotuloMes(d.mes, multiAno),
    saidas: d.saidas,
    devolucoes: d.devolucoes,
  }))
  const totalSaidas = dados.reduce((s, d) => s + d.saidas, 0)
  const totalDev = dados.reduce((s, d) => s + d.devolucoes, 0)

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-4 text-xs text-foreground/70">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: '#eda100' }} />
          Saídas ({totalSaidas.toLocaleString('pt-BR')})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: '#2a78d6' }} />
          Devoluções ({totalDev.toLocaleString('pt-BR')})
        </span>
      </div>
      <ChartContainer config={config} className="aspect-[16/6] w-full">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey="saidas" fill="var(--color-saidas)" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="saidas"
              position="top"
              offset={6}
              className="fill-foreground"
              fontSize={10.5}
              formatter={rotuloValor}
            />
          </Bar>
          <Bar dataKey="devolucoes" fill="var(--color-devolucoes)" radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="devolucoes"
              position="top"
              offset={6}
              className="fill-foreground"
              fontSize={10.5}
              formatter={rotuloValor}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
