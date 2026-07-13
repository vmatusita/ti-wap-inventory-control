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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Vocabulário de motivos oferecido na tela de movimentação.
        </p>
        <MotivoDialog />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rótulo</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Aplica-se a</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {motivos.map((m) => (
              <TableRow key={m.codigo}>
                <TableCell className="font-medium">{m.rotulo}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {m.codigo}
                </TableCell>
                <TableCell>
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
                    <Badge className="border-transparent bg-green-100 text-green-700">
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
