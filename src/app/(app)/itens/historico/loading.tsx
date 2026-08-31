import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'
import { Pagina } from '@/components/layout/pagina'

// Esqueleto de `/itens/historico`. Monta um `<Pagina>` de verdade, com a MESMA
// variante da tela — a regra 8 de `src/lib/layout/consistencia.test.ts` compara as
// duas, e divergência aqui é um salto de layout em toda navegação para a rota.
//
// Ecoa: cabeçalho + ações → a linha de filtros (busca, item, tipo, de, até,
// filial) → o quadro da tabela de lançamentos.
export default function Loading() {
  return (
    <Carregando>
      <Pagina className="print:hidden">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Skeleton className="h-9 w-full sm:w-64" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Card className="border py-0 ring-0">
          <div className="divide-y">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        </Card>
      </Pagina>
    </Carregando>
  )
}
