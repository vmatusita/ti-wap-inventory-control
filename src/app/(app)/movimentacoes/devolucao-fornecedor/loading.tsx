import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'

// F29/UXG-06b — sem este arquivo, a devolução ao fornecedor herdava o `loading.tsx` de
// /movimentacoes, que é o esqueleto do HISTÓRICO (filtros + linhas). Aqui é formulário:
// duas metades (a baixa e o substituto) numa coluna estreita.
export default function Loading() {
  return (
    <Carregando className="max-w-3xl space-y-5 print:hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {Array.from({ length: 2 }).map((_, bloco) => (
        <div key={bloco} className="space-y-4 rounded-xl border p-4">
          <Skeleton className="h-5 w-56" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      ))}

      <div className="flex flex-wrap justify-end gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-48 rounded-md" />
      </div>
    </Carregando>
  )
}
