import { Skeleton } from '@/components/ui/skeleton'

// Skeleton de /ajuda (F6B, revisão adversarial da onda 2): ecoa título + sumário
// de chips + seções do manual. Sem ele, a navegação para a Ajuda herdaria o
// esqueleto do dashboard (loading.tsx do grupo), que não bate com esta tela.
export default function Loading() {
  return (
    <div className="space-y-6 print:hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="flex gap-1.5 overflow-hidden rounded-lg border px-2 py-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-24 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="mt-6 space-y-10">
        {Array.from({ length: 3 }).map((_, s) => (
          <div key={s} className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
