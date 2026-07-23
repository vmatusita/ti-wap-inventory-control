'use client'

import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import {
  STATUS_CHART_COLOR,
  STATUS_ORDEM,
  rotuloCategoria,
  rotuloStatus,
  type StatusAtivo,
} from '@/lib/dominio'
import type { EstoqueCatStatus } from '@/lib/relatorios/tipos'

// Estoque no último dia por categoria × status (§4.1): barras horizontais
// EMPILHADAS — uma barra por categoria, segmentos por status, rótulo numérico em
// cada segmento + total na ponta. Rótulo de valor sempre visível (regra §5).

// Esconde rótulos de segmentos muito pequenos (ilegíveis); o total fica na ponta.
function rotuloSegmento(v: unknown): string {
  const n = Number(v)
  return n >= 2 ? String(n) : ''
}

export function BarrasEmpilhadas({ dados }: { dados: EstoqueCatStatus[] }) {
  // Status presentes em qualquer categoria (na ordem canônica), p/ as séries.
  const presentes = STATUS_ORDEM.filter(
    (s) =>
      s !== 'descartado' &&
      s !== 'devolvido_fornecedor' &&
      dados.some((d) => d.segmentos.some((seg) => seg.status === s && seg.total > 0)),
  )

  const data = dados.map((d) => {
    const row: Record<string, number | string> = {
      categoria: rotuloCategoria(d.categoria),
      total: d.total,
    }
    for (const s of presentes) {
      row[s] = d.segmentos.find((seg) => seg.status === s)?.total ?? 0
    }
    return row
  })

  const config: ChartConfig = {}
  for (const s of presentes) {
    config[s] = { label: rotuloStatus(s), color: STATUS_CHART_COLOR[s] }
  }

  const altura = Math.max(120, data.length * 42 + 16)
  const ultimo = presentes[presentes.length - 1]

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/70">
        {presentes.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: STATUS_CHART_COLOR[s] }} />
            {rotuloStatus(s)}
          </span>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: altura }}>
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 40, bottom: 2, left: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="categoria"
            width={78}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
          />
          {presentes.map((s) => (
            <Bar
              key={s}
              dataKey={s}
              stackId="estoque"
              fill={STATUS_CHART_COLOR[s as StatusAtivo]}
              radius={s === ultimo ? [0, 4, 4, 0] : 0}
            >
              <LabelList
                dataKey={s}
                position="center"
                className="fill-white"
                fontSize={10}
                formatter={rotuloSegmento}
              />
              {s === ultimo && (
                <LabelList
                  dataKey="total"
                  position="right"
                  offset={8}
                  className="fill-foreground font-medium"
                  fontSize={12}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  )
}
