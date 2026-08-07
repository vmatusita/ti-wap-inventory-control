'use client'

import { Fragment } from 'react'
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
import {
  BotaoExpandir,
  LinhaDetalhe,
  useExpandidas,
  type CampoDetalhe,
} from '@/components/relatorios/linha-expansivel'
import { cn } from '@/lib/utils'
import { CLASSE_COR_DELTA } from '@/lib/relatorios/delta-kpi'
import type { SaldoItemPeriodo } from '@/lib/relatorios/tipos'

// Tabela dos grupos 2–3 (§4.2). F6A: mostra Total + Estoque quando o snapshot tem
// os campos novos; snapshots antigos (só `saldo`) caem no layout legado (1 coluna
// "Saldo"), sem quebrar. Estoque em destaque (tabular-nums); Δ verde/vermelho;
// falta = chip vermelho "faltam N". Coluna atrelados só se houver. F16/T5: a Obs
// (única coluna que some no mobile, < lg) é revelada por toque via a linha de detalhe.
export function TabelaItensGrupo({
  itens,
  mostrarAtrelados,
}: {
  itens: SaldoItemPeriodo[]
  mostrarAtrelados: boolean
}) {
  const { estaAberta, alternar } = useExpandidas()
  if (itens.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhum item com registro no período.
      </p>
    )
  }
  const temTotalEstoque = itens.some((i) => i.total != null || i.estoque != null)

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 p-0 lg:hidden print:hidden" aria-hidden />
            <TableHead>Item</TableHead>
            {temTotalEstoque ? (
              <>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
              </>
            ) : (
              <TableHead className="text-right">Saldo</TableHead>
            )}
            {mostrarAtrelados && <TableHead className="text-right">Atrelados</TableHead>}
            <TableHead className="text-right">Δ período</TableHead>
            <TableHead className="text-right">Falta</TableHead>
            <TableHead className="hidden lg:table-cell">Obs.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((i) => {
            const estoque = i.estoque ?? i.saldo ?? 0
            const total = i.total ?? estoque
            const detalhe: CampoDetalhe[] = [
              { rotulo: 'Obs.', valor: i.obs ?? '—', revelar: 'lg:hidden' },
            ]
            return (
              <Fragment key={i.item}>
                <TableRow>
                  <TableCell className="w-10 p-0 pl-1 lg:hidden print:hidden">
                    <BotaoExpandir
                      aberta={estaAberta(i.item)}
                      onClick={() => alternar(i.item)}
                      rotulo={`Detalhes de ${i.item}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{i.item}</TableCell>
                  {temTotalEstoque ? (
                    <>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {total.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right text-base font-semibold tabular-nums">
                        {estoque.toLocaleString('pt-BR')}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right text-base font-semibold tabular-nums">
                      {estoque.toLocaleString('pt-BR')}
                    </TableCell>
                  )}
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
                          // REL-10 — fonte única de cor (AA): CLASSE_COR_DELTA,
                          // a mesma constante dos KPI tiles (verde já em 700
                          // p/ 4,5:1; vermelho 600 já passava).
                          i.delta > 0 ? CLASSE_COR_DELTA.verde : CLASSE_COR_DELTA.vermelho,
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
                {estaAberta(i.item) && (
                  <LinhaDetalhe colSpan={8} campos={detalhe} className="lg:hidden" />
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
