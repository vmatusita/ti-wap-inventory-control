import { listarSenhasAcesso } from '@/lib/queries/admin'
import { formatDate, formatDateTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CriarSenhaDialog } from '@/components/admin/criar-senha-dialog'
import { SenhaAcoes } from '@/components/admin/senha-acoes'
import { LinkAjuda } from '@/components/layout/link-ajuda'

export default async function AdminSenhasPage() {
  const senhas = await listarSenhasAcesso()

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-1">
          <p className="text-sm text-muted-foreground">
            Senhas de visualização dos relatórios — sem conta, revogáveis uma a uma.
          </p>
          <LinkAjuda pagina="usuarios-e-senhas" rotulo="Ajuda sobre as senhas de acesso" />
        </div>
        <CriarSenhaDialog />
      </div>

      {senhas.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Nenhuma senha de acesso criada ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rótulo</TableHead>
                <TableHead className="hidden md:table-cell">Criada em</TableHead>
                <TableHead className="hidden md:table-cell">Último uso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {senhas.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.rotulo}</TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                    {formatDate(s.created_at)}
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                    {s.ultimo_uso ? formatDateTime(s.ultimo_uso) : 'nunca'}
                  </TableCell>
                  <TableCell>
                    {s.ativa ? (
                      <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                        Ativa
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Revogada</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <SenhaAcoes id={s.id} ativa={s.ativa} rotulo={s.rotulo} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
