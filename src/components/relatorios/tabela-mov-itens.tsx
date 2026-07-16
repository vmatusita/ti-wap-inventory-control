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
import {
  pillTipoLancamento,
  rotuloGrupoItem,
  rotuloTipoLancamento,
} from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { LinhaLancamentoItem } from '@/lib/relatorios/tipos'

// B5 (F6B) — movimentações de ITENS por quantidade no período (seção própria; os
// ativos não mudam). Lançamento a lançamento. Bloco condicional (só quando houver;
// some também em snapshots antigos, sem o campo). Sem barra de filtros — componente
// server, no padrão da TabelaTransferencias. Coluna Filial só no consolidado.
// Colunas: Data · [Filial] · Item · Grupo · Tipo (pílula) · Qtd. · Chamado ·
// Colaborador · Obs. A quantidade segue a convenção do histórico: `+N` para
// positivos (o `−` natural cobre estornos/ajustes negativos).
function formatQtd(q: number): string {
  return q > 0 ? `+${q}` : `${q}`
}

export function TabelaMovItens({
  rows,
  ehGeral,
}: {
  rows: LinhaLancamentoItem[] | undefined
  ehGeral: boolean
}) {
  if (!rows || rows.length === 0) return null
  return (
    <section id="mov-itens" className="scroll-mt-16 space-y-3 break-before-page">
      <CabecalhoDetalhe titulo="Movimentações de itens" total={rows.length} />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              {ehGeral && <TableHead className="hidden sm:table-cell">Filial</TableHead>}
              <TableHead>Item</TableHead>
              <TableHead className="hidden md:table-cell">Grupo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="hidden md:table-cell">Chamado</TableHead>
              <TableHead className="hidden lg:table-cell">Colaborador</TableHead>
              <TableHead className="hidden lg:table-cell">Obs.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <CelulaData data={r.data} />
                {ehGeral && (
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">{r.filial}</TableCell>
                )}
                <TableCell className="font-medium">{r.item}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {rotuloGrupoItem(r.grupo)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span
                    className={cn(
                      'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      pillTipoLancamento(r.tipo),
                    )}
                  >
                    {rotuloTipoLancamento(r.tipo)}
                  </span>
                  {r.ehEstorno && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(estorno)</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatQtd(r.quantidade)}
                </TableCell>
                <CelulaChamado chamado={r.chamado} className="hidden md:table-cell" />
                <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                  {r.colaborador ?? '—'}
                </TableCell>
                <CelulaObs texto={r.obs} className="hidden lg:table-cell" />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
