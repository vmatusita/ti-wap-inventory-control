import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Carregando } from '@/components/layout/carregando'
import { Pagina } from '@/components/layout/pagina'

// Skeleton de /itens/conferencia — MESMO CASCO DA TELA (régua de 31/08/2026,
// F42). Ecoa: cabeçalho → linha "conferindo X" → seções por grupo (Item /
// Sistema / Contado / Diferença) → barra de resumo.
//
// Monta um `<Pagina>` de verdade, com a MESMA variante (padrão "cheia") da
// `page.tsx` — é dela que `src/lib/layout/consistencia.test.ts` compara a
// largura declarada nos dois lados.
//
// As "seções por grupo" e a barra de resumo eram `rounded-xl border bg-card` /
// `rounded-lg border` escritos à mão — a mesma moldura em três lugares. Viraram
// `Card`, no mesmo idioma do `QuadroDeTabela`: sem respiro vertical
// (`py-0 ring-0`) para a seção, que desenha o próprio rótulo e o próprio
// divide-y por dentro.
export default function Loading() {
  return (
    <Carregando>
      <Pagina className="print:hidden">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>

        {Array.from({ length: 2 }).map((_, g) => (
          <Card key={g} className="border py-0 ring-0">
            {/* O rótulo do grupo era "py-2.5" — fora da escala. py-2 é o
                passo mais próximo para uma faixa de rótulo compacta; não
                muda a altura de forma perceptível. */}
            <div className="border-b px-4 py-2">
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-11 w-24 rounded-md" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </Card>
        ))}

        <Card className="flex-row items-center justify-between gap-3 p-3">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-9 w-48 rounded-md" />
        </Card>
      </Pagina>
    </Carregando>
  )
}
