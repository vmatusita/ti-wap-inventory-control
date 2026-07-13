import { listarFiliaisAdmin } from '@/lib/queries/admin'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FilialDialog } from '@/components/admin/filial-dialog'

export default async function AdminFiliaisPage() {
  const filiais = await listarFiliaisAdmin()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filiais.length} filial(is) cadastrada(s).
        </p>
        <FilialDialog />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Ativos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filiais.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.nome}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {f.slug}
                </TableCell>
                <TableCell className="tabular-nums">
                  {f.totalAtivos.toLocaleString('pt-BR')}
                </TableCell>
                <TableCell>
                  {f.ativo ? (
                    <Badge className="border-transparent bg-green-100 text-green-700">
                      Ativa
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inativa</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <FilialDialog filial={f} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
