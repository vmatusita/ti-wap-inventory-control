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
//
// F43 — entrou a FAIXA DE CARTÕES, porque a tela ganhou um resumo antes da
// tabela. Sem ela o esqueleto prometeria uma tabela colada nos filtros e o
// conteúdo chegaria 96px mais abaixo — o salto que a regra 8 existe para evitar,
// só que na vertical, onde nenhuma regra o pega. As proporções seguem as do
// `CartaoDeMetrica` (rótulo pequeno, número grande, apoio pequeno), e as linhas
// da tabela ficaram mais altas porque a linha real agora tem duas: nome e, sob
// ele, grupo · tipo.
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
        {/* F44 — a LINHA DE ESCOPO ("Números de Cerrado Alto") e a LEGENDA da
            tabela entraram no esqueleto pela mesma razão que a faixa de cartões
            entrou na F43: são duas linhas de texto que a tela real desenha antes
            do conteúdo, e um esqueleto que as ignora entrega tudo ~44px mais
            abaixo do que prometeu. É o salto vertical que a regra 8 de
            `consistencia.test.ts` não alcança — ela compara a LARGURA declarada,
            não a silhueta. */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-52" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} size="sm">
                <div className="flex flex-col gap-1 p-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </Card>
            ))}
          </div>
        </div>
        <Card className="border py-0 ring-0">
          {/* A faixa da legenda de escopo, com o mesmo traço de baixo. */}
          <div className="border-b px-2 py-3">
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <Skeleton className="h-5 w-8" />
                <div className="flex flex-1 flex-col gap-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
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
