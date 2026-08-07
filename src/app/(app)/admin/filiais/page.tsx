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

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Filiais',
}

export default async function AdminFiliaisPage() {
  const filiais = await listarFiliaisAdmin()

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {filiais.length} filial(is) cadastrada(s).
        </p>
        <FilialDialog />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">Slug</TableHead>
              <TableHead>Ativos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filiais.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.nome}</TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                  {f.slug}
                </TableCell>
                <TableCell className="tabular-nums">
                  {f.totalAtivos.toLocaleString('pt-BR')}
                </TableCell>
                <TableCell>
                  {f.ativo ? (
                    <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
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
