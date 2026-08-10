'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bar,
  BarChart,
  LabelList,
  Rectangle,
  XAxis,
  YAxis,
  type BarShapeProps,
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
import { PREFIXO_FILTROS } from '@/lib/relatorios/prefixos-tabela'
import { rotuloComPercentual } from '@/lib/relatorios/percentual'
import { rotuloCliqueMotivo, urlFiltroMotivo } from '@/lib/relatorios/cliques-grafico'

// Barras horizontais de série única com o valor à direita (OS-F3 3.3.2). Reusado
// em "Ativos por categoria", "Saídas por motivo" e "Devoluções por motivo". Cor
// única por instância (amarelo p/ saídas, azul p/ o resto).
export type BarraItem = { rotulo: string; total: number }

export function BarrasHorizontais({
  dados,
  cor,
  comPercentual = false,
  filtroTabela,
}: {
  dados: BarraItem[]
  cor: string
  // F32/RV-08 — opcional e OFF por padrão: este componente também desenha
  // "Ativos por categoria" no dashboard, que não pode ganhar o "· NN%" sem
  // pedir. Ligado, o percentual é sempre contra a soma da PRÓPRIA `dados` —
  // nunca um total externo, senão "Saídas" e "Devoluções" (cada card com o
  // seu total de período) ficariam lendo a régua uma da outra.
  comPercentual?: boolean
  // F32/RV-12 — opcional e SERIALIZÁVEL de propósito (o chamador é um Server
  // Component — `corpo-relatorio-v2.tsx` — que não pode passar função como
  // prop). `prefixo` é o de `PREFIXO_FILTROS` (use-filtros-tabela.ts) da
  // tabela vizinha; `ancora` é o `id` da `<section>` dela. Ausente = nenhuma
  // barra vira alvo de clique — o snapshot congelado e o viewer por senha
  // (que nunca recebem esta prop) renderizam exatamente como hoje.
  filtroTabela?: { prefixo: string; ancora: string }
}) {
  const estreito = useEstreito()
  const router = useRouter()
  const searchParams = useSearchParams()
  // O destino do rótulo ("saídas"/"entradas") deriva do PREFIXO — a prop fica
  // mínima e serializável (só `{ prefixo, ancora }`, como o pedido exige) em vez
  // de carregar um terceiro campo. Comparar contra `PREFIXO_FILTROS.entradas`
  // (a fonte única de use-filtros-tabela.ts) em vez do literal 'en' evita
  // duplicar um valor que já está documentado como "NÃO renomeie" lá.
  const destino: 'saidas' | 'entradas' =
    filtroTabela?.prefixo === PREFIXO_FILTROS.entradas ? 'entradas' : 'saidas'

  // F32/RV-12 — clique na barra: troca `<prefixo>.motivo` na URL (preserva
  // período e os filtros das outras tabelas — ver `urlFiltroMotivo`) e rola até
  // a tabela. `router.replace` (não `push`): a régua já usada por
  // `use-filtros-tabela.ts` para trocar filtro é não empilhar histórico — Voltar
  // continua saindo da página, não desfazendo cliques de gráfico um a um.
  // `{ scroll: false }` porque o scroll é FEITO por nós (para a âncora, não para
  // o topo) logo em seguida.
  //
  // ARMADILHA (F9, ver use-filtros-tabela.ts): depois de uma navegação suave do
  // Next, `window.location.search` NÃO é fresca — por isso a base é
  // `searchParams.toString()` (o hook), nunca `window.location.search`.
  function aoClicarBarra(item: BarraItem) {
    if (!filtroTabela) return
    const nova = urlFiltroMotivo(filtroTabela.prefixo, item.rotulo, searchParams.toString())
    router.replace(`?${nova}`, { scroll: false })
    // `prefers-reduced-motion`: quem pediu menos movimento no SO não deveria
    // ver a rolagem animada (mesmo cuidado do `motion-reduce:` já usado em
    // spinners do repo — aqui não dá para resolver só em CSS porque
    // `scrollIntoView` recebe o `behavior` em JS).
    const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById(filtroTabela.ancora)
      ?.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' })
  }

  // Alvo clicável por barra via `shape` (Recharts v3 — `<Cell>` está DEPRECIADO,
  // remoção anunciada na v4; a Frente B já usou este caminho em
  // grafico-mov-serie.tsx). Sem `filtroTabela`, devolve o `<Rectangle>` puro —
  // MESMO elemento que o `<Bar>` desenharia sozinho sem `shape` nenhum (Rectangle
  // é o `defaultBarShape` do próprio Recharts) — então o caminho sem a prop
  // continua pixel a pixel o de antes.
  function formaBarraClicavel(props: BarShapeProps) {
    const item = dados[props.index ?? -1]
    if (!filtroTabela || !item) return <Rectangle {...props} />
    return (
      <Rectangle
        {...props}
        role="button"
        aria-label={rotuloCliqueMotivo(item.rotulo, item.total, destino)}
        cursor="pointer"
        onClick={() => aoClicarBarra(item)}
      />
    )
  }

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
    // F32/RV-12 — o Fragment SÓ acrescenta a nota quando `filtroTabela` vem: sem
    // a prop, `filtroTabela && <p…>` avalia `false`, que o React não renderiza,
    // e o Fragment com um único filho não introduz elemento algum no DOM — o
    // caminho sem a prop continua produzindo exatamente o mesmo HTML de antes.
    <>
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
          <Bar
            dataKey="total"
            fill="var(--color-total)"
            radius={[0, 4, 4, 0]}
            shape={formaBarraClicavel}
          >
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
      {/* F32/RV-12 — afordância PERSISTENTE (a régua da fase é "nada novo só em
          hover"): quem enxerga o gráfico impresso ou no viewer sem mouse precisa
          do mesmo aviso que quem passa o cursor sobre uma barra e vê o cursor
          virar ponteiro. Só existe quando `filtroTabela` existe. */}
      {filtroTabela && (
        <p className="pt-1 text-xs text-muted-foreground print:hidden">
          Clique numa barra para filtrar {destino === 'saidas' ? 'as Saídas' : 'as Entradas'} por
          este motivo.
        </p>
      )}
    </>
  )
}
