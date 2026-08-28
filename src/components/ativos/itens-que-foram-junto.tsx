import { PackageOpen } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'
import { TIPO_LANCAMENTO_META } from '@/lib/dominio'
import type { ItemQueFoiJunto } from '@/lib/queries/itens'

// "O que foi junto" (F38 · frente A) — a pergunta que até esta fase não tinha
// resposta possível.
//
// `lancamentos_item` (0015) não tinha elo nenhum com `movimentacoes`: o único fio
// era o campo de texto `chamado`, que nem sempre existe e nunca foi chave. Saber
// que o fone saiu com ESTE notebook era palpite. Com `movimentacao_id` (0116),
// virou um JOIN — e é por isso que a coluna aponta a MOVIMENTAÇÃO, e não o ativo:
// a movimentação já sabe qual é o ativo, e uma segunda cópia da mesma verdade
// seria um lugar novo para as duas discordarem.
//
// O cartão só aparece quando há o que mostrar: ativo que nunca levou periférico
// não ganha uma caixa vazia dizendo isso.
export function ItensQueForamJunto({ itens }: { itens: ItemQueFoiJunto[] }) {
  if (itens.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageOpen className="size-4" aria-hidden />
          Itens que foram junto
        </CardTitle>
        <CardDescription>
          Acessórios por quantidade registrados nas movimentações deste equipamento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {itens.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{l.item}</span>
              <Badge variant="secondary" className="shrink-0">
                {TIPO_LANCAMENTO_META[l.tipo].rotulo}
              </Badge>
              <span className="shrink-0 tabular-nums">{l.quantidade}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {formatDate(l.data)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
