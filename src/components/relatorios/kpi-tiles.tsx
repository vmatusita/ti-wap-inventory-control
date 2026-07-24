import Link from 'next/link'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KpisRelatorio } from '@/lib/relatorios/tipos'
import { CLASSE_COR_DELTA, corDelta } from '@/lib/relatorios/delta-kpi'

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
  { chave: 'em_triagem', rotulo: 'Em triagem', sub: 'devolvidos, em conferência' },
  { chave: 'em_manutencao', rotulo: 'Em manutenção', sub: 'conserto/assistência' },
  { chave: 'defasado', rotulo: 'Reserva técnica', sub: 'defasados / posse WAP' },
]

// Δ vs período anterior: seta + valor. F16/T2 — a COR carrega a semântica por
// indicador (verde=bom, vermelho=ruim, cinza=neutro), via `corDelta(chave, delta)`;
// a SETA ▲▼ permanece (a cor nunca é o único canal). Δ zero é neutro.
export function DeltaKpi({ delta, chave }: { delta: number; chave: keyof KpisRelatorio }) {
  if (delta === 0) {
    return <span className="text-[11px] text-muted-foreground tabular-nums">→ 0</span>
  }
  const positivo = delta > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        CLASSE_COR_DELTA[corDelta(chave, delta)],
      )}
    >
      {positivo ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {positivo ? '+' : ''}
      {delta.toLocaleString('pt-BR')}
    </span>
  )
}

export function KpiTiles({
  kpis,
  anterior,
  links,
}: {
  kpis: KpisRelatorio
  anterior?: KpisRelatorio
  links?: LinksKpi
}) {
  return (
    <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-7">
      {TILES.map((t) => {
        const valor = kpis[t.chave] ?? 0
        const delta = anterior ? valor - (anterior[t.chave] ?? 0) : null
        const href = links?.[t.chave]
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
              <span className="text-2xl font-bold tabular-nums">
                {valor.toLocaleString('pt-BR')}
              </span>
              {delta != null && <DeltaKpi delta={delta} chave={t.chave} />}
            </div>
            <div className="text-[11px] text-muted-foreground">{t.sub}</div>
          </>
        )

        // Sem `links` (relatórios): exatamente a <div> de sempre. Com link
        // (dashboard): mesmas classes + hover discreto e foco visível.
        return href ? (
          <Link
            key={t.chave}
            href={href}
            className={cn(
              classe,
              'block transition-colors hover:border-primary/40 hover:bg-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            {conteudo}
          </Link>
        ) : (
          <div key={t.chave} className={classe}>
            {conteudo}
          </div>
        )
      })}
    </section>
  )
}

// KPIs do grupo "Equipamentos principais" (guardados · reservados · em manutenção
// · emprestados), cada um com Δ. Derivados dos mesmos KPIs de estado.
const GRUPO_TILES: { chave: keyof KpisRelatorio; rotulo: string }[] = [
  { chave: 'em_estoque', rotulo: 'Guardados' },
  { chave: 'reservado', rotulo: 'Reservados' },
  { chave: 'em_manutencao', rotulo: 'Em manutenção' },
  { chave: 'emprestado', rotulo: 'Emprestados' },
]

export function GrupoKpis({
  kpis,
  anterior,
  links,
}: {
  kpis: KpisRelatorio
  anterior?: KpisRelatorio
  links?: LinksKpi
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {GRUPO_TILES.map((t) => {
        const valor = kpis[t.chave] ?? 0
        const delta = anterior ? valor - (anterior[t.chave] ?? 0) : null
        const href = links?.[t.chave]
        const classe = 'rounded-lg border bg-card px-3 py-2.5'
        const conteudo = (
          <>
            <div className="text-xs font-medium text-muted-foreground">{t.rotulo}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-xl font-bold tabular-nums">
                {valor.toLocaleString('pt-BR')}
              </span>
              {delta != null && <DeltaKpi delta={delta} chave={t.chave} />}
            </div>
          </>
        )
        // Sem `links` (snapshot/viewer): a <div> de sempre. Com link (ao vivo,
        // operador): mesmas classes + hover/foco discretos.
        return href ? (
          <Link
            key={t.chave}
            href={href}
            className={cn(
              classe,
              'block transition-colors hover:border-primary/40 hover:bg-accent/40 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            {conteudo}
          </Link>
        ) : (
          <div key={t.chave} className={classe}>
            {conteudo}
          </div>
        )
      })}
    </div>
  )
}
