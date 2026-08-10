'use client'

import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  Text,
  XAxis,
  YAxis,
  type BarShapeProps,
  type XAxisTickContentProps,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { mostrarRotulosDaSerie } from '@/lib/relatorios/rotulo-grafico'
import {
  ehBaldeDeHoje,
  ehFimDeSemana,
  OPACIDADE_BALDE_PARCIAL,
} from '@/lib/relatorios/calendario-serie'
import {
  alternarSerieIsolada,
  opacidadeComposta,
  OPACIDADE_SERIE_ATENUADA,
  type SerieId,
} from '@/lib/relatorios/serie-isolada'
import { hojeISO } from '@/lib/format'
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

type PontoGrafico = { chave: string; rotulo: string; saidas: number; devolucoes: number }

export function GraficoMovSerie({
  serie,
  aoVivo,
}: {
  serie: SerieMovimentacoes
  // F32/RV-05 — a marca de "hoje" (balde parcial) só é válida no relatório AO
  // VIVO: o snapshot é congelado, e se o componente chamasse `hojeISO()`
  // sozinho aqui dentro, o MESMO snapshot desenharia o selo "parcial" no dia em
  // que foi gerado e o perderia no dia seguinte — renderizaria diferente com o
  // tempo, o que quebra a promessa do congelamento. A decisão entra de fora,
  // pela rota; sem a prop (chamadas antigas, snapshot), nada muda — o v1
  // continua idêntico. Fim de semana não depende disso (é fato de calendário,
  // não "hoje") e por isso não é gateado por `aoVivo`.
  aoVivo?: boolean
}) {
  const data: PontoGrafico[] = serie.pontos.map((p) => ({
    chave: p.chave,
    rotulo: p.rotulo,
    saidas: p.saidas,
    devolucoes: p.devolucoes,
  }))
  const totalSaidas = serie.pontos.reduce((s, p) => s + p.saidas, 0)
  const totalDev = serie.pontos.reduce((s, p) => s + p.devolucoes, 0)
  // F29/REL-06b — em período longo (preset "Este ano" com balde diário) o rótulo em
  // cima de TODA barra vira uma tarja de números sobrepostos. Acima do teto os
  // rótulos somem e entra um eixo Y enxuto — a régua que o mockup previa. O valor
  // exato continua no tooltip, que este gráfico sempre teve.
  const comRotulos = mostrarRotulosDaSerie(serie.pontos.length)

  const hoje = aoVivo ? hojeISO() : null
  const ehDiario = serie.granularidade === 'dia'
  const temBaldeHoje =
    hoje !== null && data.some((p) => ehBaldeDeHoje(p.chave, serie.granularidade, hoje))

  // F32/RV-15 — isolar uma série pela legenda. Estado 100% de TELA (useState,
  // sem URL/sessionStorage): não navega (nenhum `href` novo — o teste de
  // confinamento do viewer não precisa mudar) e não escreve nada (nenhuma
  // Server Action, nenhum campo novo no snapshot v2) — só reage no navegador
  // de quem olha e reseta ao recarregar. É por isso que a régua "gateado por
  // `links`" (RV-12) NÃO se aplica aqui: aquela guarda é para navegação/escrita
  // restrita a operador+ao-vivo, e isto não é nem uma coisa nem outra — vale
  // igual no ao vivo, no snapshot congelado e no viewer por senha.
  const [serieIsolada, setSerieIsolada] = useState<SerieId | null>(null)
  // O snapshot congelado e o roteiro de impressão exigem as DUAS séries cheias
  // na página impressa, "aconteça o que acontecer com o estado local" (ordem
  // desta tarefa). `fillOpacity` do `<Rectangle>` é um ATRIBUTO SVG lido do
  // valor React a cada render — não é uma classe Tailwind, então nenhum
  // `print:opacity-100` a alcança (o `@media print` do CSS nunca chega a um
  // número já resolvido em JS). A saída é reagir ao evento de impressão: o
  // browser dispara `beforeprint` antes de rasterizar a página — a tempo de um
  // `setState` re-renderizar com a opacidade neutra — e `afterprint` quando o
  // diálogo fecha, devolvendo a tela ao estado que o operador tinha escolhido.
  const [imprimindo, setImprimindo] = useState(false)
  useEffect(() => {
    const aoComecar = () => setImprimindo(true)
    const aoTerminar = () => setImprimindo(false)
    window.addEventListener('beforeprint', aoComecar)
    window.addEventListener('afterprint', aoTerminar)
    return () => {
      window.removeEventListener('beforeprint', aoComecar)
      window.removeEventListener('afterprint', aoTerminar)
    }
  }, [])
  // Único ponto de leitura do isolamento — tanto o SVG quanto a legenda em HTML
  // consultam `serieEfetiva`, nunca `serieIsolada` direto, para que a mesma
  // regra de impressão valha nos dois canais de opacidade (attribute SVG e
  // `style` do botão) sem duplicar o `if (imprimindo)`.
  const serieEfetiva = imprimindo ? null : serieIsolada

  function alternar(clicada: SerieId) {
    setSerieIsolada((atual) => alternarSerieIsolada(atual, clicada))
  }

  // Opacidade por barra: dois efeitos independentes podem coincidir no MESMO
  // retângulo (o balde de hoje pertencer à série que acabou de ser isolada) —
  // ver `opacidadeComposta` em `serie-isolada.ts` para como eles se compõem.
  // `<Cell>` está DEPRECIADO no Recharts v3 (remoção anunciada na v4.0 — JSDoc
  // do próprio pacote instalado, node_modules/recharts/.../component/Cell.tsx);
  // a doc atual recomenda o prop `shape`, que já recebe x/y/width/height/
  // fill/stroke/radius PRONTOS do `<Bar>` — só a opacidade muda, o resto
  // (stroke/strokeWidth do RV-03) segue intacto. Fábrica (não uma função só)
  // porque o `<BarShapeProps>` do Recharts não diz a qual série (saídas ×
  // devoluções) o retângulo pertence — só o `<Bar>` que o desenha sabe; cada
  // `<Bar>` abaixo fecha sobre o próprio `idSerie`.
  function formaBarraComOpacidade(idSerie: SerieId) {
    return function Forma(props: BarShapeProps) {
      const ponto = props.payload as PontoGrafico | undefined
      const parcial =
        hoje !== null &&
        ponto !== undefined &&
        ehBaldeDeHoje(ponto.chave, serie.granularidade, hoje)
      const opacidadeBalde = parcial ? OPACIDADE_BALDE_PARCIAL : 1
      const atenuada = serieEfetiva !== null && serieEfetiva !== idSerie
      return (
        <Rectangle {...props} fillOpacity={opacidadeComposta(opacidadeBalde, atenuada)} />
      )
    }
  }

  // Tick do eixo em granularidade DIA: sábado/domingo saem atenuados — aviso
  // PERSISTENTE (a régua da fase é "nada só em hover"), não depende de
  // `aoVivo` porque fim de semana é fato de calendário, não "hoje". Reproduz
  // o tick padrão do Recharts (mesmo <Text>, mesmos props recebidos — ver
  // node_modules/recharts/.../cartesian/CartesianAxis.js) e só acrescenta
  // `opacity`: escrever a geometria do zero arrisca destoar do resto do eixo,
  // e `interval="preserveStartEnd"` mede a largura renderizada para decidir
  // quantos ticks cabem — reaproveitar o `<Text>` oficial mantém essa conta
  // igual à de antes. `payload.index` é o índice ORIGINAL no domínio da
  // categoria (o `index` de fora é a posição no subconjunto já filtrado pelo
  // `interval` — os dois divergem sempre que algum tick é escondido).
  function tickComFimDeSemana(props: XAxisTickContentProps) {
    const chave = data[props.payload.index]?.chave ?? ''
    const atenuado = ehFimDeSemana(chave)
    return (
      <Text {...props} fontSize={11} opacity={atenuado ? 0.6 : 1}>
        {String(props.payload.value)}
      </Text>
    )
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-4 text-xs text-foreground/70">
        {/* F32/RV-15 — "atenua/isola", não "esconde": a série não-clicada some
            de DESTAQUE (opacity via `style`, não `hidden`/`display:none`), mas
            o swatch, o rótulo e o total continuam desenhados e legíveis — a
            régua da fase é "nada some sem aviso". `<button>` (não `<span>`)
            porque isto agora é um CONTROLE: `aria-pressed` diz o estado a
            leitor de tela, `focus-visible:ring-3 ring-ring/50` é o mesmo anel
            de foco do resto da casa (`button.tsx`/`lista-filtros.tsx`), e
            `min-h-10`/`-mx-1.5 -my-1` alargam o alvo de toque no celular sem
            deslocar o texto (a margem negativa cancela o padding acrescido —
            mesmo truque de `chips-ancora.tsx`), voltando ao tamanho natural
            do `sm` para cima. */}
        <button
          type="button"
          onClick={() => alternar('saidas')}
          aria-pressed={serieEfetiva === 'saidas'}
          className="-mx-1.5 -my-1 flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
          style={{ opacity: serieEfetiva === 'devolucoes' ? OPACIDADE_SERIE_ATENUADA : 1 }}
        >
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-brand-amarelo)' }} />
          Saídas ({totalSaidas.toLocaleString('pt-BR')})
        </button>
        <button
          type="button"
          onClick={() => alternar('devolucoes')}
          aria-pressed={serieEfetiva === 'devolucoes'}
          className="-mx-1.5 -my-1 flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
          style={{ opacity: serieEfetiva === 'saidas' ? OPACIDADE_SERIE_ATENUADA : 1 }}
        >
          <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--color-brand-azul)' }} />
          Devoluções ({totalDev.toLocaleString('pt-BR')})
        </button>
        {temBaldeHoje && (
          // Texto, não só opacidade — a régua da fase é "nada novo só em
          // hover" — e sem `print:hidden`: o papel também precisa saber que o
          // último dia é parcial.
          <span className="text-muted-foreground">hoje, parcial</span>
        )}
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
            tick={ehDiario ? tickComFimDeSemana : { fontSize: 11 }}
          />
          {!comRotulos && (
            <YAxis
              width={30}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tick={{ fontSize: 11 }}
            />
          )}
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          {/* F32/RV-03 — 2px de respiro na cor da superfície entre as barras do
              par. Aqui elas não se empilham, mas em balde apertado (preset longo,
              eixo com muitos pontos) os dois retângulos encostam e o par
              amarelo/azul vira um bloco só; a fresta devolve a leitura do par —
              e é o único separador que sobra na impressão P&B. */}
          <Bar
            dataKey="saidas"
            fill="var(--color-saidas)"
            radius={[4, 4, 0, 0]}
            stroke="var(--card)"
            strokeWidth={2}
            shape={formaBarraComOpacidade('saidas')}
          >
            {comRotulos && (
              <LabelList
                dataKey="saidas"
                position="top"
                offset={6}
                className="fill-foreground"
                fontSize={10}
                formatter={rotuloValor}
              />
            )}
          </Bar>
          <Bar
            dataKey="devolucoes"
            fill="var(--color-devolucoes)"
            radius={[4, 4, 0, 0]}
            stroke="var(--card)"
            strokeWidth={2}
            shape={formaBarraComOpacidade('devolucoes')}
          >
            {comRotulos && (
              <LabelList
                dataKey="devolucoes"
                position="top"
                offset={6}
                className="fill-foreground"
                fontSize={10}
                formatter={rotuloValor}
              />
            )}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
