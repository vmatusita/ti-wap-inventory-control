import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'

// Skeleton de /movimentacoes (F11 · M8). Ecoa o layout real: cabeçalho + botão →
// barra de filtros (busca, tipo, filial, de, até) → tabela de 10 linhas.
export default function Loading() {
  return (
    <Carregando className="space-y-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Skeleton className="h-9 w-full sm:w-80" />
        <Skeleton className="h-9 w-[190px]" />
        <Skeleton className="h-9 w-[170px]" />
        <Skeleton className="h-9 w-[160px]" />
        <Skeleton className="h-9 w-[160px]" />
      </div>

      <div className="rounded-lg border">
        <div className="divide-y">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </div>
    </Carregando>
  )
}
