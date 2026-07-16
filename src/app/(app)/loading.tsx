import { Skeleton } from '@/components/ui/skeleton'
import { EsqueletoKpiTiles } from '@/components/layout/esqueleto-relatorio'

// Skeleton do Dashboard — rota índice do grupo (app). Ecoa: título → KPIs →
// 2 cards (pendências / últimas movimentações) → 4 atalhos. Como é o loading da
// rota-índice do grupo, cobre também rotas sem loading próprio (fallback breve).
export default function Loading() {
  return (
    <div className="space-y-6 print:hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      <EsqueletoKpiTiles />

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-5 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border bg-card p-5">
            <Skeleton className="size-9 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
