import { ArrowRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CabecalhoDetalhe,
  CelulaChamado,
  CelulaData,
  CelulaObs,
} from '@/components/relatorios/celulas'
import { rotuloCategoria } from '@/lib/dominio'
import type { LinhaTransferencia } from '@/lib/relatorios/tipos'

// Transferências do período (§4.4) — bloco condicional (só quando houver). Sem
// barra de filtros (é a exceção entre as tabelas). Colunas: Data · De → Para ·
// Categoria · Marca/Modelo · Patrimônio · Chamado · Obs. Células compartilhadas
// (OS tech-debt 3.2); componente server (sem estado).
export function TabelaTransferencias({ rows }: { rows: LinhaTransferencia[] }) {
  if (rows.length === 0) return null
  return (
    <section id="transferencias" className="scroll-mt-28 space-y-3 break-before-page">
      <CabecalhoDetalhe titulo="Transferências" total={rows.length} />
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
                <CelulaData data={r.data} />
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
                <CelulaChamado chamado={r.chamado} className="hidden md:table-cell" />
                <CelulaObs texto={r.obs} className="hidden lg:table-cell" />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
