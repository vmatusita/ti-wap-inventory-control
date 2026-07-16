import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Peças de skeleton compartilhadas pelas telas de relatório (F6B/B1). Ecoam a
// grade do CorpoRelatorioV2 (chips-âncora → KPIs → gráficos → tabelas) para o
// swap não "pular". Sem texto/número — só blocos. Usadas no loading.tsx do
// relatório ao vivo e do snapshot congelado.

// Card genérico: título + bloco de conteúdo, na moldura `rounded-lg border`.
export function EsqueletoCard({
  altura = 'h-40',
  className,
}: {
  altura?: string
  className?: string
}) {
  return (
    <div className={cn('space-y-3 rounded-lg border bg-card p-4', className)}>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className={cn('w-full rounded-md', altura)} />
    </div>
  )
}

// Seção de tabela: cabeçalho ("Título — N no período") + linhas.
export function EsqueletoSecaoTabela({ linhas = 4 }: { linhas?: number }) {
  return (
    <section className="space-y-3">
      <Skeleton className="h-5 w-52" />
      <div className="rounded-lg border">
        <div className="divide-y">
          {Array.from({ length: linhas }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Faixa de 7 KPI tiles (mesma grade do KpiTiles).
export function EsqueletoKpiTiles() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-7">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'space-y-2 rounded-xl border bg-card px-3.5 py-3',
            i === 0 && 'col-span-2 sm:col-span-3 xl:col-span-1',
          )}
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  )
}

// Corpo do relatório (v2): chips-âncora + KPIs + gráficos + tabelas.
export function EsqueletoRelatorioCorpo() {
  return (
    <div className="space-y-4">
      {/* chips-âncora */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>

      <EsqueletoKpiTiles />

      {/* gráfico de série (largura cheia) */}
      <EsqueletoCard altura="h-56" />

      {/* grade de gráficos do grupo principal */}
      <div className="grid gap-3.5 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <EsqueletoCard key={i} altura="h-40" />
        ))}
      </div>

      {/* tabelas detalhadas */}
      <EsqueletoSecaoTabela />
      <EsqueletoSecaoTabela />
    </div>
  )
}
