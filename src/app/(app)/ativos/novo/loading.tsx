import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'
import { MEDIDA_DE_FORMULARIO, Pagina } from '@/components/layout/pagina'

// F29/UXG-06b — sem este arquivo, /ativos/novo herdava o `loading.tsx` de /ativos, que
// é o esqueleto de uma LISTA (filtros + linhas de tabela): quem clicava em "Novo
// equipamento" via a silhueta da tela de onde estava saindo. Aqui é FORMULÁRIO — coluna
// estreita, campos empilhados e a barra de ação no fim.
//
// F40 — o esqueleto divergia da tela em DUAS coisas: ritmava a `space-y-5` contra o
// `space-y-6` da página, e limitava a largura sem centralizar contra o `mx-auto
// max-w-3xl` de lá. Agora os dois montam o MESMO `<Pagina>` e a medida do formulário
// vem da MESMA constante — o teste de consistência compara as duas e reprova a
// divergência, em vez de ela aparecer como salto em toda navegação.
export default function Loading() {
  return (
    <Carregando>
      <Pagina className="print:hidden">
        <Skeleton className="h-5 w-36" />

        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        <div className={`flex flex-col gap-4 ${MEDIDA_DE_FORMULARIO}`}>
          {/* Abas "Faixa" × "Colar lista" */}
          <Skeleton className="h-9 w-64 max-w-full rounded-md" />

          <Card>
            <div className="flex flex-col gap-4 px-(--card-spacing)">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-40 rounded-md" />
          </div>
        </div>
      </Pagina>
    </Carregando>
  )
}
