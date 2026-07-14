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
                <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                  {it.lancamentos.toLocaleString('pt-BR')}
                </TableCell>
                <TableCell>
                  {it.ativo ? (
                    <Badge className="border-transparent bg-green-100 text-green-700">
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
