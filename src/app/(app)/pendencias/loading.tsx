import { Skeleton } from '@/components/ui/skeleton'

// Skeleton de /pendencias. Ecoa: cabeçalho → chips-resumo por bucket → filtros
// (tabs + busca + filial) → tabela com badges.
export default function Loading() {
  return (
    <div className="space-y-4 print:hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* chips por bucket */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-40 rounded-xl" />
        ))}
      </div>

      {/* filtros: tabs + busca + filial */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-full sm:max-w-xs" />
          <Skeleton className="h-9 w-[170px]" />
        </div>
      </div>

      {/* tabela */}
      <div className="rounded-xl border">
        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-40 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
