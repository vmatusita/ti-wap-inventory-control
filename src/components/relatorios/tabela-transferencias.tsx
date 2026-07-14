import { ArrowRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { formatDate } from '@/lib/format'
import { rotuloCategoria } from '@/lib/dominio'
import type { LinhaTransferencia } from '@/lib/relatorios/tipos'

// Transferências do período (§4.4) — bloco condicional (só quando houver).
// Colunas: Data · De → Para · Categoria · Marca/Modelo · Patrimônio · Chamado · Obs.
export function TabelaTransferencias({ rows }: { rows: LinhaTransferencia[] }) {
  if (rows.length === 0) return null
  return (
    <section id="transferencias" className="scroll-mt-16 space-y-3 break-before-page">
      <h2 className="text-lg font-semibold tracking-tight">
        Transferências — {rows.length.toLocaleString('pt-BR')} no período
      </h2>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>De → Para</TableHead>
              <TableHead className="hidden sm:table-cell">Categoria</TableHead>
              <TableHead className="hidden lg:table-cell">Marca/Modelo</TableHead>
              <TableHead>Patrimônio</TableHead>
              <TableHead className="hidden md:table-cell">Chamado</TableHead>
              <TableHead className="hidden lg:table-cell">Obs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDate(r.data)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {r.de}
                    <ArrowRight className="size-3 text-muted-foreground" />
                    {r.para}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{rotuloCategoria(r.categoria)}</TableCell>
                <TableCell className="hidden whitespace-nowrap lg:table-cell">{r.modelo}</TableCell>
                <TableCell className="whitespace-nowrap font-medium tabular-nums">{r.patrimonio}</TableCell>
                <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                  {r.chamado ? `#${r.chamado}` : '—'}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="max-w-[220px]">
                    <ObsTooltip texto={r.obs} className="w-full text-xs" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
