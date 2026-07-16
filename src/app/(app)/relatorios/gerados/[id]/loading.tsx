import { Skeleton } from '@/components/ui/skeleton'
import { EsqueletoRelatorioCorpo } from '@/components/layout/esqueleto-relatorio'

// Skeleton do snapshot congelado. Ecoa: link de volta → banner de meta →
// cabeçalho → corpo do relatório (reusa o skeleton do relatório ao vivo).
export default function Loading() {
  return (
    <div className="space-y-4 print:hidden">
      <Skeleton className="h-4 w-40" />

      {/* banner "dados congelados" */}
      <Skeleton className="h-11 w-full rounded-lg" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>

      <EsqueletoRelatorioCorpo />
    </div>
  )
}
