import { Skeleton } from '@/components/ui/skeleton'

// Skeleton de /movimentacoes/nova. Ecoa a coluna centrada (max-w-3xl): título +
// o formulário/wizard em passos (busca de ativo, campos e ações).
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 print:hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="space-y-5 rounded-xl border bg-card p-5">
        {/* indicador de passos */}
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 flex-1 rounded-full" />
          ))}
        </div>

        {/* busca de ativo */}
        <Skeleton className="h-10 w-full" />

        {/* campos do formulário */}
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>

        <Skeleton className="h-20 w-full rounded-md" />

        {/* ações */}
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
    </div>
  )
}
