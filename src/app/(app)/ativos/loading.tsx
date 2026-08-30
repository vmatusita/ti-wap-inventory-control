import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'
import { Pagina } from '@/components/layout/pagina'

// F40 — O ESQUELETO USA O MESMO CASCO DA TELA.
//
// Antes ele copiava as classes do container da página à mão (`space-y-5` aqui
// contra `space-y-5` lá), e era assim que dois esqueletos do produto tinham
// divergido em silêncio. Com `<Pagina>` nos dois lados, a largura e o ritmo vêm
// da MESMA tabela, e `src/lib/layout/consistencia.test.ts` compara a variante
// declarada aqui com a da tela — divergência vira teste vermelho, não um salto
// de layout em toda navegação.
//
// A moldura da tabela também virou `Card`, a mesma que o `QuadroDeTabela`
// desenha: esqueleto que promete um traço diferente do que chega depois é um
// piscar a cada carregamento.
export default function Loading() {
  return (
    <Carregando>
      <Pagina className="print:hidden">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-full sm:w-72" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Card className="py-0">
          <div className="divide-y">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))}
          </div>
        </Card>
      </Pagina>
    </Carregando>
  )
}
