import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// O QUADRO DE UMA TABELA (F40).
//
// As listas emolduravam a MESMA `<Table>` de formas diferentes:
// `overflow-hidden rounded-lg border` em /ativos, `rounded-lg border` em
// /relatorios/gerados e em /admin/senhas, `rounded-xl border bg-card` em
// /pendencias e /itens — quatro raios e três traços para o mesmo objeto, dentro
// do mesmo produto.
//
// Agora é um `Card` SEM RESPIRO VERTICAL: a tabela encosta na moldura, como uma
// tabela deve encostar, e as bordas de linha dela é que fazem a divisão interna.
// O `Table` do kit já traz `overflow-x-auto` no invólucro, então o que não couber
// rola DENTRO do quadro, sem empurrar a página.
//
// ⚠ O `Card` do kit tem `overflow-hidden`: nada com `position: sticky` que
// precise grudar na JANELA pode morar aqui dentro (a barra de seleção de
// `/ativos` é irmã do quadro justamente por isso — ver
// `src/components/ativos/barra-selecao-ativos.tsx`).
//
// ⚠ IMPRESSÃO: o traço do `Card` é `ring-1`, que é box-shadow, e navegador
// descarta box-shadow no papel. O `@media print` de `src/app/globals.css`
// converte o anel em borda real — sem isso o relatório impresso perderia os
// quadros todos de uma vez.

export function QuadroDeTabela({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <Card className={cn('py-0', className)}>{children}</Card>
}
