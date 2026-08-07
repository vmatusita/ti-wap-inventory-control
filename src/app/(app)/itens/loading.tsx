import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'

// Skeleton de /itens. Ecoa: cabeçalho + ações → filtros → seções por grupo
// (tabela Item/Total/Estoque/Atrelados/Falta) → histórico de lançamentos.
export default function Loading() {
  return (
    <Carregando className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>

      {/* filtros: busca + 2 selects */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-[170px]" />
        <Skeleton className="h-9 w-[170px]" />
      </div>

      {/* saldos por grupo */}
      {Array.from({ length: 2 }).map((_, g) => (
        <section key={g} className="rounded-xl border bg-card">
          <div className="border-b px-4 py-2.5">
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* histórico de lançamentos */}
      <section className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <div className="rounded-lg border">
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </Carregando>
  )
}
