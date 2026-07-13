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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {usuarios.length} operador(es) com acesso ao sistema.
        </p>
        <ConvidarUsuarioDialog />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{ouTraco(u.nome)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {ouTraco(u.email)}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
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
