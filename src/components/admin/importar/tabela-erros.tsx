import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ErroImport } from '@/lib/import'

// Tabela de bloqueantes/avisos do preview (colunas linha·coluna·valor·motivo, do
// motor W1). Usada duas vezes na tela — uma para bloqueantes, outra para avisos.
export function TabelaErros({ erros }: { erros: ErroImport[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Linha</TableHead>
            <TableHead className="w-32">Coluna</TableHead>
            <TableHead className="w-40">Valor</TableHead>
            <TableHead>Motivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {erros.map((e, i) => (
            <TableRow key={`${e.linha}-${e.tipo}-${i}`}>
              <TableCell className="tabular-nums text-muted-foreground">{e.linha}</TableCell>
              <TableCell className="font-medium">{e.coluna}</TableCell>
              <TableCell className="max-w-40 truncate font-mono text-xs" title={e.valor}>
                {e.valor || '—'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{e.mensagem}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
