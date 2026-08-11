import Link from 'next/link'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dica } from '@/components/ui/dica'
import { STATUS_CHART_COLOR, type StatusAtivo } from '@/lib/dominio'
import type { Periodo } from '@/lib/relatorios/periodo'
import type { KpisRelatorio } from '@/lib/relatorios/tipos'
import { CLASSE_COR_DELTA, corDelta, textoDelta } from '@/lib/relatorios/delta-kpi'

// F32/RV-01a — o acento de cor do tile. Até aqui a cor de status só existia nos
// segmentos das barras empilhadas: o leitor aprendia a cor num gráfico e não a
// reencontrava em lugar nenhum, porque tile, badge e glossário eram
// monocromáticos. Agora tile → segmento → badge → glossário formam um
// aprendizado só.
//
// É uma barra de 3px no TOPO do tile, não o fundo inteiro: bloco saturado grande
// é o anti-padrão clássico (rouba a atenção do número, que é o conteúdo) e
// arruinaria o contraste do texto. Como acento decorativo, ele nunca é o único
// canal — o rótulo escrito continua dizendo qual é a situação.
//
// Toda chave de `KpisRelatorio` exceto `total` É um `StatusAtivo`; "Total de
// ativos" fica SEM acento de propósito — não é uma situação, é a soma delas.
function acentoDoTile(chave: keyof KpisRelatorio): React.CSSProperties | undefined {
  if (chave === 'total') return undefined
  // F32/RV-20 — `borderTopStyle` explícito aqui (não só `-Width`/`-Color`) é o
  // que sustenta o acento nos DOIS chamadores. Em `KpiTiles` a classe `border`
  // do tile já dá border-style: solid nos quatro lados, então isto seria
  // redundante; mas em `GrupoKpis` o RV-20 tirou essa classe (o grupo virou
  // "bg-muted/40 sem borda" de propósito, pra pesar menos que os tiles
  // principais) — sem `border-style` de algum lugar ele fica no valor inicial
  // `none`, e um `border-top-width: 3px` com `border-style: none` não desenha
  // NADA (largura só conta quando o estilo não é none). Fixar o style aqui,
  // na função compartilhada, resolve os dois casos com uma leitura e sem
  // depender de qual classe cada chamador aplica no tile.
  return {
    borderTopWidth: 3,
    borderTopStyle: 'solid',
    borderTopColor: STATUS_CHART_COLOR[chave as StatusAtivo],
  }
}

// Destinos opcionais por tile (OS-F9 / T2). Só o dashboard passa: nos relatórios
// (ao vivo e snapshot) a prop não vem e o tile continua sendo uma <div> — mesmo
// visual, mesmo comportamento de antes.
export type LinksKpi = Partial<Record<keyof KpisRelatorio, string>>

// KPI tiles (spec §7 / mockup + OS-F3 3.3.1). Reconcilia a lista da spec §7
// (inclui "em triagem") com o mockup (inclui "reserva técnica"): mostra os dois.
// v2 (F3B): quando `anterior` vem, mostra o Δ vs período anterior (setinha ▲▼).
const TILES: { chave: keyof KpisRelatorio; rotulo: string; sub: string }[] = [
  { chave: 'total', rotulo: 'Total de ativos', sub: 'no inventário' },
  { chave: 'em_uso', rotulo: 'Em uso', sub: 'com colaborador/setor' },
  { chave: 'em_estoque', rotulo: 'Em estoque', sub: 'disponíveis p/ entrega' },
  { chave: 'reservado', rotulo: 'Reservados', sub: 'aguardando entrega' },
  // F34 — "devolvidos" deixou de ser verdade: a devolução volta direto ao estoque
  // e só quem foi mandado à triagem de propósito (`envio_triagem`) aparece aqui.
  { chave: 'em_triagem', rotulo: 'Em triagem', sub: 'separados p/ conferência' },
  { chave: 'em_manutencao', rotulo: 'Em manutenção', sub: 'conserto/assistência' },
  { chave: 'defasado', rotulo: 'Reserva técnica', sub: 'defasados / posse WAP' },
]

// Δ vs período anterior: seta + valor. F16/T2 — a COR carrega a semântica por
// indicador (verde=bom, vermelho=ruim, cinza=neutro), via `corDelta(chave, delta)`;
// a SETA ▲▼ permanece (a cor nunca é o único canal). Δ zero é neutro.
//
// F29/REL-07 — quando o período é conhecido (relatório ao vivo e snapshot), o Δ vira
// gatilho de `Dica`: "Anterior: N (dd/MM a dd/MM) → atual: M (dd/MM a dd/MM)". A Dica
// abre por FOCO de teclado, não só por hover, e a seta + o número continuam visíveis
// — nada do que o papel precisa ler passou para o hover.
export function DeltaKpi({
  delta,
  chave,
  valorAtual,
  valorAnterior,
  periodo,
}: {
  delta: number
  chave: keyof KpisRelatorio
  valorAtual?: number
  valorAnterior?: number
  periodo?: Periodo
}) {
  const conteudo =
    delta === 0 ? (
      <span className="text-[11px] text-muted-foreground tabular-nums">→ 0</span>
    ) : (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
          CLASSE_COR_DELTA[corDelta(chave, delta)],
        )}
      >
        {delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
        {delta > 0 ? '+' : ''}
        {delta.toLocaleString('pt-BR')}
      </span>
    )

  const texto =
    valorAtual === undefined || valorAnterior === undefined
      ? null
      : textoDelta(valorAtual, valorAnterior, periodo)
  if (!texto) return conteudo

  return (
    <Dica texto={texto} className="inline-flex">
      {conteudo}
    </Dica>
  )
}

export function KpiTiles({
  kpis,
  anterior,
  links,
  periodo,
}: {
  kpis: KpisRelatorio
  anterior?: KpisRelatorio
  links?: LinksKpi
  /** F29/REL-07 — período do relatório, para a Dica dizer a janela de comparação.
   *  Ausente (dashboard) = Δ exatamente como antes, sem Dica. */
  periodo?: Periodo
}) {
  return (
    <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-7">
      {TILES.map((t) => {
        const valor = kpis[t.chave] ?? 0
        const valorAnterior = anterior ? (anterior[t.chave] ?? 0) : null
        const delta = valorAnterior === null ? null : valor - valorAnterior
        const href = links?.[t.chave]
        const acento = acentoDoTile(t.chave)
        const classe = cn(
          'rounded-xl border bg-card px-3.5 py-3',
          // 7 tiles (nº primo) deixariam um órfão em quase todo breakpoint;
          // "Total de ativos" ocupa a linha cheia (menos no xl, onde os 7 cabem).
          t.chave === 'total' && 'col-span-2 sm:col-span-3 xl:col-span-1',
        )
        const conteudo = (
          <>
            <div className="text-xs font-semibold text-foreground/80">{t.rotulo}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              {/* F32/RV-22 — sem `tabular-nums` aqui: dígito de largura fixa serve
                  pra ALINHAR EM COLUNA (tabela, eixo — onde vários números ficam
                  um embaixo do outro e precisam bater). Um valor isolado de 24px
                  não alinha com nada ao lado; o efeito que sobra é só o "121" com
                  buraco no 1 estreito. O Δ ao lado (`DeltaKpi`) mantém
                  `tabular-nums` de propósito — ele alinha com o irmão dele. */}
              <span className="text-2xl font-bold">{valor.toLocaleString('pt-BR')}</span>
              {delta != null && (
                <DeltaKpi
                  delta={delta}
                  chave={t.chave}
                  valorAtual={valor}
                  valorAnterior={valorAnterior ?? undefined}
                  periodo={periodo}
                />
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">{t.sub}</div>
          </>
        )

        // Sem `links` (relatórios): exatamente a <div> de sempre. Com link
        // (dashboard): mesmas classes + hover discreto e foco visível.
        // O acento vai em `style` (não em classe) por dois motivos: a cor vem de
        // um mapa de dados, não de um token do Tailwind; e o estilo em linha vence
        // o `hover:border-primary/40` do tile clicável, que senão apagaria o
        // acento justamente no gesto em que o leitor está olhando para ele.
        return href ? (
          <Link
            key={t.chave}
            href={href}
            style={acento}
            className={cn(
              classe,
              'block transition-colors hover:border-primary/40 hover:bg-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            {conteudo}
          </Link>
        ) : (
          <div key={t.chave} className={classe} style={acento}>
            {conteudo}
          </div>
        )
      })}
    </section>
  )
}

// KPIs do grupo "Equipamentos principais" (guardados · reservados · em manutenção
// · emprestados), cada um com Δ. Derivados dos mesmos KPIs de estado. F17/B5 — cada
// tile ganhou um `sub` (os tiles principais já tinham): "Guardados" explica na hora
// que é o MESMO número de "Em estoque" (o mesmo dado com dois nomes).
const GRUPO_TILES: { chave: keyof KpisRelatorio; rotulo: string; sub: string }[] = [
  { chave: 'em_estoque', rotulo: 'Guardados', sub: '= Em estoque' },
  { chave: 'reservado', rotulo: 'Reservados', sub: 'aguardando entrega' },
  { chave: 'em_manutencao', rotulo: 'Em manutenção', sub: 'conserto/assistência' },
  { chave: 'emprestado', rotulo: 'Emprestados', sub: 'cedidos, com retorno' },
]

export function GrupoKpis({
  kpis,
  anterior,
  links,
  periodo,
}: {
  kpis: KpisRelatorio
  anterior?: KpisRelatorio
  links?: LinksKpi
  periodo?: Periodo
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {GRUPO_TILES.map((t) => {
        const valor = kpis[t.chave] ?? 0
        const valorAnterior = anterior ? (anterior[t.chave] ?? 0) : null
        const delta = valorAnterior === null ? null : valor - valorAnterior
        const href = links?.[t.chave]
        const acento = acentoDoTile(t.chave)
        // F32/RV-20 — o grupo repete 3 dos 7 números já mostrados 200px acima,
        // no MESMO desenho de tile: o leitor não sabia se estava vendo dado novo
        // ou dado repetido. `bg-muted/40` sem `border` (era `border bg-card`,
        // idêntico ao tile principal) e valor `text-lg` (era `text-xl`, contra o
        // `text-2xl` do tile principal) rebaixam o peso visual sem mudar o
        // conteúdo. A perda da classe `border` é a armadilha do acento — ver o
        // comentário de `acentoDoTile`.
        const classe = 'rounded-lg bg-muted/40 px-3 py-2.5'
        const conteudo = (
          <>
            <div className="text-xs font-medium text-muted-foreground">{t.rotulo}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              {/* F32/RV-22 — mesmo raciocínio do tile principal: número isolado,
                  não coluna, `tabular-nums` só cria buracos visuais. */}
              <span className="text-lg font-bold">{valor.toLocaleString('pt-BR')}</span>
              {delta != null && (
                <DeltaKpi
                  delta={delta}
                  chave={t.chave}
                  valorAtual={valor}
                  valorAnterior={valorAnterior ?? undefined}
                  periodo={periodo}
                />
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">{t.sub}</div>
          </>
        )
        // Sem `links` (snapshot/viewer): a <div> de sempre. Com link (ao vivo,
        // operador): mesmas classes + hover/foco discretos.
        return href ? (
          <Link
            key={t.chave}
            href={href}
            style={acento}
            className={cn(
              classe,
              'block transition-colors hover:border-primary/40 hover:bg-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            {conteudo}
          </Link>
        ) : (
          <div key={t.chave} className={classe} style={acento}>
            {conteudo}
          </div>
        )
      })}
    </div>
  )
}
