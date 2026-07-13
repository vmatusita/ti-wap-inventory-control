import { listarUsuarios } from '@/lib/queries/admin'
import { formatDate, ouTraco } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConvidarUsuarioDialog } from '@/components/admin/convidar-usuario-dialog'

export default async function AdminUsuariosPage() {
  const usuarios = await listarUsuarios()

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {usuarios.length} operador(es) com acesso ao sistema.
        </p>
        <ConvidarUsuarioDialog />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="hidden md:table-cell">Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{ouTraco(u.nome)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {ouTraco(u.email)}
                </TableCell>
                <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                  {formatDate(u.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
