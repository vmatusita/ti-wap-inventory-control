import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'

// F29/UXG-06b — /dev e /dev/destrutivo caíam no `loading.tsx` da rota-índice do grupo,
// que é o esqueleto do DASHBOARD (fileira de KPIs + 2 cards + 4 atalhos): nada a ver
// com esta tela, e o operador via a silhueta de uma página que não ia chegar.
//
// A tela real é uma pilha de <Card> do shadcn — quatro em /dev (diagnóstico, checagens
// de integridade, auditoria e manutenção), um em /dev/destrutivo. O cabeçalho ("Desenvolvedor"
// + a descrição) vive no `dev/layout.tsx`, ACIMA do boundary de streaming, e continua
// na tela — por isso este esqueleto não o repete, como o de /admin já fazia.
export default function Loading() {
  return (
    <Carregando className="space-y-4 print:hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ))}
    </Carregando>
  )
}
