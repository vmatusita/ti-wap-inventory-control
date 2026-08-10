'use client'

import { Bar, BarChart, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { useEstreito } from '@/components/relatorios/use-estreito'
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

// F29/REL-06a — o tooltip deste gráfico não existia, e não bastava plugá-lo: as
// saídas são gravadas NEGATIVAS no dado (é o que as joga para a esquerda), então o
// conteúdo padrão diria "Saídas −3". O formatter refaz a linha em valor absoluto,
// mantendo o quadradinho de cor e o rótulo do config.
function LinhaTooltip({
  cor,
  rotulo,
  valor,
}: {
  cor: string | undefined
  rotulo: string
  valor: number
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-[2px]"
        style={{ background: cor }}
      />
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
        {Math.abs(Number(valor)).toLocaleString('pt-BR')}
      </span>
    </div>
  )
}

export function BarrasDivergentes({ itens }: { itens: SaldoItemPeriodo[] }) {
  const estreito = useEstreito()
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
  // F32/RV-10 — o eixo era 110px FIXO e o tick cortava o nome em 18 caracteres,
  // sem socorro: o tooltip do Recharts abre pela BARRA, e item com movimento só
  // de um lado tem barra minúscula do outro. No desktop o eixo agora respira até
  // 150px (a mesma régua das barras horizontais), e o nome cabe em 24 caracteres.
  // O nome COMPLETO segue no cabeçalho do tooltip: o `tickFormatter` trunca só o
  // texto do tick — o `dataKey="item"` que alimenta o tooltip é o valor cheio.
  const larguraEixo = estreito ? 96 : 150
  const maxRotulo = estreito ? 14 : 24

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
            width={larguraEixo}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) =>
              v.length > maxRotulo ? `${v.slice(0, maxRotulo - 1)}…` : v
            }
          />
          <ReferenceLine x={0} stroke="var(--border)" />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(valor, nome, item) => (
                  <LinhaTooltip
                    cor={item?.color}
                    rotulo={config[nome as keyof typeof config]?.label ?? String(nome)}
                    valor={Number(valor)}
                  />
                )}
              />
            }
          />
          {/* F32/RV-03 — 2px de respiro na cor da superfície entre as duas marcas
              do mesmo `stackId`: a fresta separa saída de entrada mesmo quando o
              item tem os dois lados quase colados no zero, e sobrevive à
              impressão P&B, onde a cor não separa nada. */}
          <Bar
            dataKey="saidas"
            fill="var(--color-saidas)"
            stackId="mov"
            radius={[4, 0, 0, 4]}
            stroke="var(--card)"
            strokeWidth={2}
          >
            <LabelList dataKey="saidas" position="left" offset={6} className="fill-foreground" fontSize={11} formatter={abs} />
          </Bar>
          <Bar
            dataKey="entradas"
            fill="var(--color-entradas)"
            stackId="mov"
            radius={[0, 4, 4, 0]}
            stroke="var(--card)"
            strokeWidth={2}
          >
            <LabelList dataKey="entradas" position="right" offset={6} className="fill-foreground" fontSize={11} formatter={abs} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
