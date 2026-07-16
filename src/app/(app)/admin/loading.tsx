import { Skeleton } from '@/components/ui/skeleton'

// Skeleton genérico do grupo /admin. O cabeçalho ("Administração") e a AdminNav
// vivem no admin/layout.tsx (acima do boundary) e permanecem; este skeleton
// cobre só o conteúdo da subpágina — todas são tabelas (usuários, senhas,
// filiais, motivos, itens): barra de ação + tabela.
export default function Loading() {
  return (
    <div className="space-y-4 print:hidden">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="rounded-lg border">
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-28 md:block" />
              <Skeleton className="h-6 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
