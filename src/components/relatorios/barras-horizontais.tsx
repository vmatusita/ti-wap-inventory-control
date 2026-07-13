'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

// Barras horizontais de série única com o valor à direita (OS-F3 3.3.2). Reusado
// em "Ativos por categoria", "Saídas por motivo" e "Devoluções por motivo". Cor
// única por instância (amarelo p/ saídas, azul p/ o resto).
export type BarraItem = { rotulo: string; total: number }

// No mobile o card fica em coluna única e estreita: um eixo Y de 150px comeria
// quase metade da largura útil e rótulos longos de motivo estourariam. Encolhemos
// o eixo e truncamos o rótulo abaixo de sm (o valor exato segue à direita/tooltip).
function useEstreito(): boolean {
  const [estreito, setEstreito] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setEstreito(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return estreito
}

export function BarrasHorizontais({
  dados,
  cor,
}: {
  dados: BarraItem[]
  cor: string
}) {
  const estreito = useEstreito()

  const config = {
    total: { label: 'Total', color: cor },
  } satisfies ChartConfig

  // Altura proporcional ao nº de barras (cada uma ~34px), com teto mínimo.
  const altura = Math.max(90, dados.length * 34 + 8)
  const larguraEixo = estreito ? 96 : 150
  const maxRotulo = estreito ? 14 : 24

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: altura }}
    >
      <BarChart
        data={dados}
        layout="vertical"
        margin={{ top: 2, right: 34, bottom: 2, left: 4 }}
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
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey="total"
            position="right"
            offset={8}
            className="fill-foreground"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
