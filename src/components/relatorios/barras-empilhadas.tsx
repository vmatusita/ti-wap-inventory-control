'use client'

import { useRouter } from 'next/navigation'
import { Bar, BarChart, LabelList, Rectangle, XAxis, YAxis, type BarShapeProps } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
  type ChartTooltipItem,
} from '@/components/ui/chart'
import {
  STATUS_CHART_COLOR,
  STATUS_ORDEM,
  rotuloCategoria,
  rotuloStatus,
  type CategoriaAtivo,
  type StatusAtivo,
} from '@/lib/dominio'
import { deveRotularSegmento, fillRotuloSegmento } from '@/lib/relatorios/rotulo-grafico'
import { rotuloCliqueSegmento, urlAtivosPorSegmento } from '@/lib/relatorios/cliques-grafico'
import type { EstoqueCatStatus } from '@/lib/relatorios/tipos'
import { cn } from '@/lib/utils'

// Estoque no último dia por categoria × status (§4.1): barras horizontais
// EMPILHADAS — uma barra por categoria, segmentos por status, rótulo numérico em
// cada segmento + total na ponta. Rótulo de valor sempre visível (regra §5).

export function BarrasEmpilhadas({
  dados,
  recorteFilial,
}: {
  dados: EstoqueCatStatus[]
  // F32/RV-12 — opcional e SERIALIZÁVEL (o chamador é Server Component): o
  // fragmento pronto de `recorteFilialAtivos` (kpi-links.ts), a mesma
  // sentinela `&filial=todas`/`&filial=<id>` que os KPI tiles já usam.
  // Ausente = nenhum segmento vira alvo de clique — snapshot e viewer, que
  // nunca recebem a prop, renderizam exatamente como hoje.
  recorteFilial?: string
}) {
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
      // F32/RV-12 — a chave CRUA junto do rótulo: `/ativos?categoria=` espera o
      // valor do enum ("notebook"), não o rótulo em pt-BR ("Notebook") que a
      // linha já guarda para o eixo Y. Sem isto, a URL do clique carregaria
      // "categoria=Notebook" e `/ativos` (case-sensitive) IGNORARIA o filtro
      // em silêncio — achado que só apareceria testando o link, não o tipo.
      categoriaChave: d.categoria,
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

  const router = useRouter()

  // F32/RV-12 — alvo clicável por SEGMENTO via `shape` (mesmo caminho de
  // barras-horizontais.tsx e de grafico-mov-serie.tsx — `<Cell>` está
  // DEPRECIADO no Recharts v3). Uma fábrica por `status` porque cada `<Bar>`
  // do loop abaixo é UMA série (um status) espalhada por todas as categorias;
  // `props.payload` é a LINHA inteira (`data[i]`, com todos os status +
  // `categoriaChave` + `total`), então o valor DESTE segmento é
  // `payload[status]`, não `payload.total`.
  //
  // Segmento de valor zero não é alvo de clique (não há o que ver do outro
  // lado — instrução da ordem) nem sem `recorteFilial`: as duas condições
  // caem no MESMO retorno do `<Bar>` sem `shape`, então o segmento zero e o
  // caminho sem a prop renderizam pixel a pixel como hoje.
  function formaSegmentoClicavel(status: StatusAtivo) {
    // Nome próprio (não anônima): `react/display-name` marca função retornada
    // que devolve JSX sem nome como "componente sem display name".
    return function Segmento(props: BarShapeProps) {
      const linha = props.payload as Record<string, number | string> | undefined
      const valor = linha ? Number(linha[status]) : 0
      if (!recorteFilial || !linha || !(valor > 0)) return <Rectangle {...props} />
      const categoria = linha.categoriaChave as CategoriaAtivo
      // ACHADO-2 — extraída para `onClick` e `onKeyDown` compartilharem a
      // MESMA navegação, em vez de montar a URL duas vezes.
      const irParaLista = () =>
        router.push(urlAtivosPorSegmento(status, categoria, recorteFilial))
      return (
        <Rectangle
          {...props}
          role="button"
          aria-label={rotuloCliqueSegmento(status, categoria, valor)}
          cursor="pointer"
          onClick={irParaLista}
          // ACHADO-2 — o segmento se ANUNCIA como botão (`role="button"`),
          // mas sem isto Tab nunca parava nele e Enter/Espaço não faziam
          // nada: o único caminho até a lista filtrada era o mouse.
          // `tabIndex={0}` põe o segmento na ordem de tabulação; o
          // `onKeyDown` dispara a mesma navegação do clique nas duas teclas
          // que ativam um botão nativo — `preventDefault` no espaço evita
          // que ele role a página, como faria em qualquer elemento focável.
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            irParaLista()
          }}
          // `outline` em SVG é inconsistente entre navegadores; o anel de
          // foco reaproveita o traço que o segmento já desenha (RV-03, 2px
          // na cor do card para separar vizinhos colados) e só troca a COR
          // desse traço para a de primeiro plano quando o foco vem do
          // teclado (`focus-visible`) — não mexe na geometria do segmento.
          className={cn((props as { className?: string }).className, 'focus-visible:stroke-foreground')}
        />
      )
    }
  }

  // F32/ACHADO-11 — o total da categoria só existia no rótulo da ponta da
  // barra; no hover o leitor tinha de somar os segmentos de cabeça. Todo item
  // do payload do tooltip carrega a MESMA linha de dados (`data[i]`, com o
  // `total` incluso) — o primeiro item já basta para ler o total, sem
  // depender de qual série é a última. Vira o rodapé via a prop `footer` do
  // `ChartTooltipContent` (chart.tsx), o que deixa o desenho de CADA série a
  // cargo do componente padrão do shadcn — não há mais linha reimplementada.
  const rodapeTotal = (payload: ChartTooltipItem[]) => (
    <div className="mt-1 flex w-full items-center justify-between border-t border-border/50 pt-1 leading-none">
      <span className="text-muted-foreground">Total</span>
      <span className="font-mono font-medium tabular-nums text-foreground">
        {Number(payload[0]?.payload?.total ?? 0).toLocaleString('pt-BR')}
      </span>
    </div>
  )

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
              precisar somar 5 segmentos de cabeça.
              F32/ACHADO-11 — o total voltou a ser um RODAPÉ (`footer`), não um
              `formatter` que redesenhava linha por linha: cada série volta a
              usar o desenho PADRÃO do `ChartTooltipContent` (swatch, rótulo e
              valor), e só o total abaixo dele é conteúdo próprio deste gráfico. */}
          <ChartTooltip cursor={false} content={<ChartTooltipContent footer={rodapeTotal} />} />
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
              shape={formaSegmentoClicavel(s)}
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
      {/* F32/RV-12 — afordância PERSISTENTE (a régua da fase é "nada novo só em
          hover"): mesmo texto-guia de barras-horizontais.tsx, só existe quando
          `recorteFilial` existe — sem a prop, o card renderiza como hoje. */}
      {recorteFilial && (
        <p className="pt-1 text-xs text-muted-foreground print:hidden">
          Clique num segmento para ver esses ativos na lista.
        </p>
      )}
    </div>
  )
}
