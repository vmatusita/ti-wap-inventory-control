import type { KpisRelatorio } from '@/lib/relatorios/tipos'

// KPI tiles (spec §7 / mockup + OS-F3 3.3.1). Reconcilia a lista da spec §7
// (inclui "em triagem") com o mockup (inclui "reserva técnica"): mostra os dois.
const TILES: { chave: keyof KpisRelatorio; rotulo: string; sub: string }[] = [
  { chave: 'total', rotulo: 'Total de ativos', sub: 'no inventário' },
  { chave: 'em_uso', rotulo: 'Em uso', sub: 'com colaborador/setor' },
  { chave: 'em_estoque', rotulo: 'Em estoque', sub: 'disponíveis p/ entrega' },
  { chave: 'reservado', rotulo: 'Reservados', sub: 'aguardando entrega' },
  { chave: 'em_triagem', rotulo: 'Em triagem', sub: 'devolvidos, em conferência' },
  { chave: 'em_manutencao', rotulo: 'Em manutenção', sub: 'conserto/assistência' },
  { chave: 'defasado', rotulo: 'Reserva técnica', sub: 'defasados / posse WAP' },
]

export function KpiTiles({ kpis }: { kpis: KpisRelatorio }) {
  return (
    <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-7">
      {TILES.map((t) => (
        <div key={t.chave} className="rounded-xl border bg-card px-3.5 py-3">
          <div className="text-xs font-semibold text-foreground/80">{t.rotulo}</div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums">
            {kpis[t.chave].toLocaleString('pt-BR')}
          </div>
          <div className="text-[11px] text-muted-foreground">{t.sub}</div>
        </div>
      ))}
    </section>
  )
}
