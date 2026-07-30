import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateTime, ouTraco } from '@/lib/format'
import { rotuloAcao } from '@/lib/auditoria'
import { descreverDetalhe } from '@/components/admin/usuarios/detalhe-evento'
import type { EventoAdminLinha } from '@/lib/queries/eventos-admin'

// Tabela da aba "Auditoria" (F21 — `eventos_admin`). Server Component: a trilha é leitura
// pura, e o RLS (`select ... using (e_admin())`) já garante que só admin recebe linha.

export function AuditoriaTabela({
  linhas,
  filiais,
}: {
  linhas: readonly EventoAdminLinha[]
  /** Para traduzir ids de filial do `detalhe` em nomes. */
  filiais: readonly { id: number; nome: string }[]
}) {
  const nomeFilial = (id: number) => filiais.find((f) => f.id === id)?.nome ?? `filial ${id}`

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Quando</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Sobre</TableHead>
            <TableHead className="hidden md:table-cell">Detalhe</TableHead>
            <TableHead className="hidden sm:table-cell">Quem fez</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {formatDateTime(l.quando)}
              </TableCell>
              <TableCell className="font-medium">{rotuloAcao(l.acao)}</TableCell>
              <TableCell className="break-all">{ouTraco(l.alvo)}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {ouTraco(descreverDetalhe(l.acao, l.detalhe, nomeFilial))}
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {/* autor nulo = o perfil foi removido DEPOIS do evento (a trilha
                    sobrevive à exclusão da conta, por desenho da migration 0065). */}
                {l.autorNome ?? 'usuário removido'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
