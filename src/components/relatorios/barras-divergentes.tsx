'use client'

import { Bar, BarChart, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import type { SaldoItemPeriodo } from '@/lib/relatorios/tipos'

// Movimentação do período por item (§4.2): barras DIVERGENTES — entradas para a
// direita (azul), saídas para a esquerda (amarelo), rótulo em valor absoluto
// nas pontas. Só itens com movimento. Domínio simétrico + eixo 0. Cores da marca
// WAP via token.
const config = {
  entradas: { label: 'Entradas', color: 'var(--color-brand-azul)' },
  saidas: { label: 'Saídas', color: 'var(--color-brand-amarelo)' },
} satisfies ChartConfig

function abs(v: unknown): string {
  const n = Math.abs(Number(v))
  return n > 0 ? String(n) : ''
}

export function BarrasDivergentes({ itens }: { itens: SaldoItemPeriodo[] }) {
  const comMov = itens.filter((i) => i.entradas > 0 || i.saidas > 0)
  if (comMov.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Sem movimentação no período.
      </p>
    )
  }

  const data = comMov.map((i) => ({
    item: i.item,
    entradas: i.entradas,
    saidas: -i.saidas, // negativo → esquerda
  }))
  const maxAbs = Math.max(1, ...data.map((d) => Math.max(d.entradas, Math.abs(d.saidas))))
  const altura = Math.max(120, data.length * 34 + 16)

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/70">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-brand-amarelo)' }} />
          Saídas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-brand-azul)' }} />
          Entradas
        </span>
      </div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: altura }}>
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 28, bottom: 2, left: 28 }}>
          <XAxis type="number" domain={[-maxAbs, maxAbs]} hide />
          <YAxis
            type="category"
            dataKey="item"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
          />
          <ReferenceLine x={0} stroke="var(--border)" />
          <Bar dataKey="saidas" fill="var(--color-saidas)" stackId="mov" radius={[4, 0, 0, 4]}>
            <LabelList dataKey="saidas" position="left" offset={6} className="fill-foreground" fontSize={11} formatter={abs} />
          </Bar>
          <Bar dataKey="entradas" fill="var(--color-entradas)" stackId="mov" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="entradas" position="right" offset={6} className="fill-foreground" fontSize={11} formatter={abs} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
