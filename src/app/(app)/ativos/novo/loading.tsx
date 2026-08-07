import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'

// F29/UXG-06b — sem este arquivo, /ativos/novo herdava o `loading.tsx` de /ativos, que
// é o esqueleto de uma LISTA (filtros + linhas de tabela): quem clicava em "Novo
// equipamento" via a silhueta da tela de onde estava saindo. Aqui é FORMULÁRIO — coluna
// estreita, campos empilhados e a barra de ação no fim.
export default function Loading() {
  return (
    <Carregando className="max-w-3xl space-y-5 print:hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Abas "Faixa" × "Colar lista" */}
      <Skeleton className="h-9 w-64 max-w-full rounded-md" />

      <div className="space-y-4 rounded-xl border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
    </Carregando>
  )
}
