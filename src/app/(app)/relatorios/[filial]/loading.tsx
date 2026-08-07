import { Skeleton } from '@/components/ui/skeleton'
import { EsqueletoRelatorioCorpo } from '@/components/layout/esqueleto-relatorio'
import { Carregando } from '@/components/layout/carregando'

// Skeleton do relatório ao vivo (filial ou consolidado). Ecoa: cabeçalho +
// cluster de ações → tabs de filial → filtro de período → corpo do relatório.
export default function Loading() {
  return (
    <Carregando className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      <div className="space-y-3">
        {/* tabs de filial */}
        <div className="flex gap-3 border-b pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20" />
          ))}
        </div>
        {/* presets de período */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
      </div>

      <EsqueletoRelatorioCorpo />
    </Carregando>
  )
}
