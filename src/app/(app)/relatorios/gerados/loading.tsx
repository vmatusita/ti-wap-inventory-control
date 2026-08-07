import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'

// Skeleton de /relatorios/gerados. Ecoa: cabeçalho + ações → tabela do arquivo
// (Período · Filial · Versão · Por · Em · Abrir).
export default function Loading() {
  return (
    <Carregando className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-[180px] rounded-md" />
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-10 rounded-md" />
              <Skeleton className="hidden h-4 w-28 md:block" />
              <Skeleton className="hidden h-4 w-32 md:block" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </Carregando>
  )
}
