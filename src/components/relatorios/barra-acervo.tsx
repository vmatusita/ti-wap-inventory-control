'use client'

import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { STATUS_CHART_COLOR, rotuloStatus } from '@/lib/dominio'
import type { AcervoPorSituacao } from '@/lib/relatorios/acervo'
import { deveRotularSegmento, fillRotuloSegmento } from '@/lib/relatorios/rotulo-grafico'

// F32/RV-07 — "Acervo por situação": UMA barra 100% empilhada com o acervo
// inteiro, entre os KPI tiles e o resto da página.
//
// É o elo que faltava entre os tiles (que agora têm o acento de cor) e as
// empilhadas por categoria: em ~28px de altura o leitor vê a composição do
// acervo inteiro, que antes exigia somar cinco barras de cabeça. Mesmas cores,
// mesma ordem canônica, mesma régua de rótulo — a diferença é que aqui a barra
// ocupa a largura toda, então a fração de cada segmento é sobre o TOTAL.
//
// Deriva de `estoqueCatStatus`, que o snapshot já tem: nenhum campo novo no JSON
// congelado, nenhuma leitura nova, nenhuma contagem nova (`acervo.ts` é puro e
// testado). Snapshot v2 antigo abre com o card, porque o insumo sempre esteve lá.
export function BarraAcervo({ acervo }: { acervo: AcervoPorSituacao }) {
  const { segmentos, total } = acervo

  // Uma linha só: cada status é uma série com o próprio `<Bar>` no mesmo stack.
  const linha: Record<string, number | string> = { linha: 'acervo', total }
  for (const s of segmentos) linha[s.status] = s.total

  const config: ChartConfig = {}
  for (const s of segmentos) {
    config[s.status] = { label: rotuloStatus(s.status), color: STATUS_CHART_COLOR[s.status] }
  }

  const ultimo = segmentos[segmentos.length - 1]?.status
  // A barra ocupa a área de plotagem inteira, então a referência de "cabe?" é o
  // total — não o maior de uma lista, como nas empilhadas por categoria.
  const rotuloSegmento = (v: unknown): string => {
    const n = Number(v)
    return deveRotularSegmento(n, Math.max(1, total)) ? String(n) : ''
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/70">
        {segmentos.map((s) => (
          <span key={s.status} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[3px]"
              style={{ background: STATUS_CHART_COLOR[s.status] }}
            />
            {rotuloStatus(s.status)}
            <span className="tabular-nums text-muted-foreground">
              {s.total.toLocaleString('pt-BR')}
            </span>
          </span>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 56 }}>
        <BarChart
          data={[linha]}
          layout="vertical"
          margin={{ top: 2, right: 44, bottom: 2, left: 4 }}
          barCategoryGap={0}
        >
          <XAxis type="number" hide />
          {/* Sem rótulo de categoria: a barra É o acervo, e o título do card já o
              diz. Escondendo o eixo, a barra ocupa a largura toda. */}
          <YAxis type="category" dataKey="linha" hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {segmentos.map((s) => (
            <Bar
              key={s.status}
              dataKey={s.status}
              stackId="acervo"
              fill={STATUS_CHART_COLOR[s.status]}
              radius={s.status === ultimo ? [0, 4, 4, 0] : 0}
              /* F32/RV-03 — o mesmo respiro de 2px das empilhadas. Aqui ele é
                 ainda mais necessário: os sete status se tocam numa barra só. */
              stroke="var(--card)"
              strokeWidth={2}
              barSize={28}
            >
              <LabelList
                dataKey={s.status}
                position="center"
                className={fillRotuloSegmento(STATUS_CHART_COLOR[s.status])}
                fontSize={11}
                formatter={rotuloSegmento}
              />
              {s.status === ultimo && (
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
