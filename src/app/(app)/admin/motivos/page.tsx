import { listarMotivosAdmin } from '@/lib/queries/admin'
import { rotuloTipo } from '@/lib/dominio'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MotivoDialog } from '@/components/admin/motivo-dialog'

export default async function AdminMotivosPage() {
  const motivos = await listarMotivosAdmin()

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Vocabulário de motivos oferecido na tela de movimentação.
        </p>
        <MotivoDialog />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rótulo</TableHead>
              <TableHead className="hidden md:table-cell">Código</TableHead>
              <TableHead className="hidden lg:table-cell">Aplica-se a</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {motivos.map((m) => (
              <TableRow key={m.codigo}>
                <TableCell className="font-medium">{m.rotulo}</TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                  {m.codigo}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex max-w-md flex-wrap gap-1">
                    {m.aplica_a.map((t) => (
                      <Badge key={t} variant="secondary" className="font-normal">
                        {rotuloTipo(t)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {m.ativo ? (
                    <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <MotivoDialog motivo={m} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
