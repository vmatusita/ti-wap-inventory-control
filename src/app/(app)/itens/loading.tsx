import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'
import { Pagina } from '@/components/layout/pagina'

// F42 — O ESQUELETO USA O MESMO CASCO DA TELA.
//
// Antes ele copiava as classes do container à mão (`space-y-4`) e desenhava as
// DUAS seções que a tela tinha: blocos por grupo e mais um bloco de histórico.
// Agora monta um `<Pagina>` de verdade, com a mesma variante — a regra 8 de
// `src/lib/layout/consistencia.test.ts` compara a largura declarada aqui com a da
// `page.tsx`, e divergência vira teste vermelho em vez de salto de layout a cada
// navegação para a rota.
//
// A moldura da tabela também é `Card`, a mesma que o `QuadroDeTabela` desenha:
// esqueleto que promete um traço diferente do que chega depois é um piscar a
// cada carregamento.
export default function Loading() {
  return (
    <Carregando>
      <Pagina className="print:hidden">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-full sm:w-72" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-44" />
        </div>
        <Card className="border py-0 ring-0">
          <div className="divide-y">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        </Card>
      </Pagina>
    </Carregando>
  )
}
