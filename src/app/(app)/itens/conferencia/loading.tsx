import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'

// Skeleton de /itens/conferencia. Ecoa: cabeçalho → linha "conferindo X" →
// seções por grupo (Item / Sistema / Contado / Diferença) → barra de resumo.
export default function Loading() {
  return (
    <Carregando className="space-y-4 print:hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-36 rounded-md" />
      </div>

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
                <Skeleton className="h-11 w-24 rounded-md" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-9 w-48 rounded-md" />
      </div>
    </Carregando>
  )
}
