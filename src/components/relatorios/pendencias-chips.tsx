import type { ChipPendencia } from '@/lib/relatorios/tipos'

// Chips de pendências (mockup + OS-F3 3.2.2). Só aparecem os buckets com total > 0.
export function PendenciasChips({ pendencias }: { pendencias: ChipPendencia[] }) {
  if (pendencias.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma pendência aberta. 🎉
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {pendencias.map((p) => (
        <span
          key={p.chave}
          className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900"
        >
          <span className="font-bold tabular-nums">
            {p.total.toLocaleString('pt-BR')}
          </span>{' '}
          {p.rotulo}
        </span>
      ))}
    </div>
  )
}
