import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'
import { Pagina } from '@/components/layout/pagina'

// F40 — o esqueleto monta o MESMO `<Pagina>` da ficha, e é dele que a largura e o
// ritmo saem nos dois lados (`src/lib/layout/consistencia.test.ts` compara).
export default function Loading() {
  return (
    <Carregando>
      <Pagina className="print:hidden">
        <Skeleton className="h-4 w-36" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-44" />
        </div>
        <Card className="h-40 w-full py-0" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Card className="h-24 w-full py-0" />
          <Card className="h-24 w-full py-0" />
        </div>
      </Pagina>
    </Carregando>
  )
}
