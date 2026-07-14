import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { cn } from '@/lib/utils'
import type { SaldoItemPeriodo } from '@/lib/relatorios/tipos'

// Tabela dos grupos 2–3 (§4.2): item · saldo · atrelados · Δ período · falta ·
// obs. Saldo em destaque (tabular-nums); Δ verde/vermelho; falta = chip vermelho
// "faltam N" (o "p.s." do e-mail, automático). Coluna atrelados só se houver.
export function TabelaItensGrupo({
  itens,
  mostrarAtrelados,
}: {
  itens: SaldoItemPeriodo[]
  mostrarAtrelados: boolean
}) {
  if (itens.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhum item com registro no período.
      </p>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            {mostrarAtrelados && <TableHead className="text-right">Atrelados</TableHead>}
            <TableHead className="text-right">Δ período</TableHead>
            <TableHead className="text-right">Falta</TableHead>
            <TableHead className="hidden lg:table-cell">Obs.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((i) => (
            <TableRow key={i.item}>
              <TableCell className="font-medium">{i.item}</TableCell>
              <TableCell className="text-right text-base font-semibold tabular-nums">
                {i.saldo.toLocaleString('pt-BR')}
              </TableCell>
              {mostrarAtrelados && (
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {i.atrelados > 0 ? i.atrelados.toLocaleString('pt-BR') : '—'}
                </TableCell>
              )}
              <TableCell className="text-right">
                {i.delta === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    className={cn(
                      'inline-flex items-center justify-end gap-0.5 tabular-nums',
                      i.delta > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400',
                    )}
                  >
                    {i.delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    {i.delta > 0 ? '+' : ''}
                    {i.delta.toLocaleString('pt-BR')}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {i.falta > 0 ? (
                  <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 tabular-nums dark:bg-red-950 dark:text-red-300">
                    faltam {i.falta.toLocaleString('pt-BR')}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <div className="max-w-[220px]">
                  <ObsTooltip texto={i.obs} className="w-full text-xs" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
