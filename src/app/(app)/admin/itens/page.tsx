import { listarItensAdmin } from '@/lib/queries/itens'
import { GRUPO_ITEM_META } from '@/lib/dominio'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ItemDialog } from '@/components/admin/item-dialog'

// FLX-03 — título curto da aba (WCAG 2.4.2). "Catálogo de itens", e não só
// "Itens": a tela `/itens` (saldos por quantidade) já usa esse título curto —
// mesma sentinela em duas abas seria a própria falha que a fase corrige.
export const metadata = {
  title: 'Catálogo de itens',
}

export default async function AdminItensPage() {
  const itens = await listarItensAdmin()

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Catálogo de acessórios, periféricos e componentes controlados por quantidade.
        </p>
        <ItemDialog />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead className="hidden text-right md:table-cell">Ordem</TableHead>
              {/* Mínimo aparece antes de Ordem no corte de tela (`sm`, não `md`):
                  é regra de operação — decide o aviso "repor" em /itens —,
                  enquanto Ordem só governa a posição no combobox. */}
              <TableHead className="hidden text-right sm:table-cell">Mínimo</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Lançamentos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.nome}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-normal">
                    {GRUPO_ITEM_META[it.grupo].rotulo}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                  {it.ordem}
                </TableCell>
                {/* Mínimo 0 sai como travessão, não como "0": zero não é um piso
                    de estoque, é a AUSÊNCIA de acompanhamento — um 0 numa coluna
                    de limites se lê como "alerta quando ficar abaixo de zero".
                    Mesma convenção do travessão de Atrelados/Falta em /itens. */}
                <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                  {it.estoque_minimo > 0 ? (
                    <span className="font-medium text-foreground">
                      {it.estoque_minimo.toLocaleString('pt-BR')}
                    </span>
                  ) : (
                    <span title="Sem alerta de reposição">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                  {it.lancamentos.toLocaleString('pt-BR')}
                </TableCell>
                <TableCell>
                  {it.ativo ? (
                    <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <ItemDialog item={it} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
