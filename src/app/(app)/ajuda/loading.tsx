import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'

// Esqueleto do indice da documentacao (F6B, reajustado na F20): ecoa titulo,
// busca, os chips de categoria e os cards de pagina. Sem ele, a navegacao para a
// Ajuda herdaria o esqueleto do dashboard (loading.tsx do grupo).
export default function Loading() {
  return (
    <Carregando className="space-y-6 print:hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <Skeleton className="h-9 w-full max-w-md rounded-md" />

      <div className="flex gap-1.5 overflow-hidden rounded-lg border px-2 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-24 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="mt-6 space-y-10">
        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, c) => (
                <Skeleton key={c} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Carregando>
  )
}
