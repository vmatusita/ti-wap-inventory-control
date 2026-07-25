import { Skeleton } from '@/components/ui/skeleton'

// Esqueleto de uma pagina da documentacao (F20). Sem ele, a navegacao herdaria
// o esqueleto do grupo (dashboard), que nao bate com esta tela. Ecoa trilha,
// titulo, sumario e os primeiros blocos.
export default function Loading() {
  return (
    <div className="max-w-3xl space-y-6 print:hidden">
      <Skeleton className="h-3 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  )
}
