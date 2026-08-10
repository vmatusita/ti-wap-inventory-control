'use client'

import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  STATUS_CHART_COLOR,
  STATUS_ORDEM,
  rotuloCategoria,
  rotuloStatus,
  type StatusAtivo,
} from '@/lib/dominio'
import { deveRotularSegmento, fillRotuloSegmento } from '@/lib/relatorios/rotulo-grafico'
import type { EstoqueCatStatus } from '@/lib/relatorios/tipos'

// Estoque no último dia por categoria × status (§4.1): barras horizontais
// EMPILHADAS — uma barra por categoria, segmentos por status, rótulo numérico em
// cada segmento + total na ponta. Rótulo de valor sempre visível (regra §5).

// Uma linha do tooltip, no MESMO desenho que o `ChartTooltipContent` produz
// sozinho (swatch 10px + rótulo atenuado + valor monoespaçado à direita). Existe
// porque fornecer `formatter` substitui a linha inteira: para acrescentar o
// rodapé do total (F32/RV-23) na última série, é preciso redesenhar as demais.
// Espelho deliberado de `chart.tsx` — se o desenho de lá mudar, este acompanha.
function LinhaTooltip({
  cor,
  rotulo,
  valor,
}: {
  cor?: string
  rotulo: React.ReactNode
  valor: number
}) {
  return (
    <>
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
        style={{ background: cor }}
        aria-hidden
      />
      <div className="flex flex-1 items-center justify-between leading-none">
        <span className="text-muted-foreground">{rotulo}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {valor.toLocaleString('pt-BR')}
        </span>
      </div>
    </>
  )
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
  // Referência de largura para decidir o que cabe: a barra mais longa ocupa a área
  // inteira de plotagem, então a fração de cada segmento é `valor / maxTotal`.
  const maxTotal = Math.max(1, ...dados.map((d) => d.total))
  const rotuloSegmento = (v: unknown): string => {
    const n = Number(v)
    return deveRotularSegmento(n, maxTotal) ? String(n) : ''
  }

  // F32/RV-23 — o total da categoria só existia no rótulo da ponta da barra; no
  // hover o leitor tinha de somar os segmentos de cabeça. O Recharts entrega uma
  // entrada de payload por `<Bar>` (inclusive as de valor zero), na ordem em que
  // foram declaradas: a última é `presentes[presentes.length - 1]`, e é nela que
  // o rodapé entra — dentro da caixa do tooltip, não abaixo dela.
  const ultimoIndice = presentes.length - 1
  const linhaTooltip = (
    valor: unknown,
    nome: unknown,
    item: { color?: string; payload?: Record<string, unknown> },
    indice: number,
  ) => {
    const linha = (
      <LinhaTooltip
        cor={item?.color ?? (item?.payload?.fill as string | undefined)}
        rotulo={config[String(nome)]?.label ?? String(nome)}
        valor={Number(valor)}
      />
    )
    if (indice !== ultimoIndice) return linha
    return (
      <>
        {linha}
        <div className="mt-1 flex w-full items-center justify-between border-t border-border/50 pt-1 leading-none">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {Number(item?.payload?.total ?? 0).toLocaleString('pt-BR')}
          </span>
        </div>
      </>
    )
  }

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
          {/* F29/REL-06a — este gráfico não tinha tooltip nenhum. Segmento pequeno
              ficava sem rótulo E sem hover, e o par âmbar × laranja de então era
              quase a mesma cor para daltônicos: o tooltip era o desempate que
              faltava. A F32 consertou o par na raiz (a triagem virou rosa — ver
              STATUS_CHART_COLOR), e o tooltip continua sendo o 4º canal.
              F32/RV-23 — o rodapé do tooltip passou a trazer o TOTAL da categoria,
              que só existia no rótulo da ponta: quem está no hover não deveria
              precisar somar 5 segmentos de cabeça. */}
          <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={linhaTooltip} />} />
          {presentes.map((s) => (
            <Bar
              key={s}
              dataKey={s}
              stackId="estoque"
              fill={STATUS_CHART_COLOR[s as StatusAtivo]}
              radius={s === ultimo ? [0, 4, 4, 0] : 0}
              /* F32/RV-03 — 2px de respiro na cor da SUPERFÍCIE entre segmentos
                 colados. Vizinhos de matiz parecido passam a se separar pela
                 fresta, não pela sorte da cor; é o complemento estrutural da
                 paleta nova e o que segura a leitura na impressão P&B, onde
                 matiz nenhum sobrevive. `var(--card)` acompanha o tema. */
              stroke="var(--card)"
              strokeWidth={2}
            >
              {/* F19 — o rótulo era branco fixo a 10px e reprovava o mínimo de
                  4,5:1 em quase todo segmento. Agora sai branco ou preto, o que
                  contrastar mais com a cor daquela barra (rotulo-grafico.ts);
                  como as cores de status são hex fixos, o resultado vale igual
                  no tema claro e no escuro.
                  F29 — o corte desceu de "≥2" para "≥1, se a barra comportar":
                  `deveRotularSegmento` decide pela fração da barra mais longa. */}
              <LabelList
                dataKey={s}
                position="center"
                className={fillRotuloSegmento(STATUS_CHART_COLOR[s])}
                fontSize={11}
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
