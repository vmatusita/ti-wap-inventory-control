import { redirect } from 'next/navigation'
import { getOperador } from '@/lib/auth/acesso'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  getHistoricoLancamentos,
  getSaldosItens,
  getUltimoLancamento,
  listarItensAtivos,
} from '@/lib/queries/itens'
import { GRUPO_ITEM_META, GRUPO_ITEM_ORDEM, type GrupoItem } from '@/lib/dominio'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ItensFiltros } from '@/components/itens/itens-filtros'
import { LancarItemDialog } from '@/components/itens/lancar-item-dialog'
import { HistoricoLancamentos } from '@/components/itens/historico-lancamentos'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

export default async function ItensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const sp = await searchParams
  const filialId = primeiro(sp.filial) ? Number(primeiro(sp.filial)) : null
  const grupoFiltro = primeiro(sp.grupo) as GrupoItem | undefined
  const q = (primeiro(sp.q) ?? '').trim().toLowerCase()
  const page = Math.max(1, Number(primeiro(sp.page) ?? '1') || 1)

  const [filiais, itensAtivos, saldos, ultimo, historico] = await Promise.all([
    listarFiliais(),
    listarItensAtivos(),
    getSaldosItens(Number.isFinite(filialId) ? filialId : null),
    getUltimoLancamento(operador.id),
    getHistoricoLancamentos({
      filialId: Number.isFinite(filialId) ? filialId : null,
      page,
      pageSize: 20,
    }),
  ])

  const saldosFiltrados = saldos.filter(
    (s) =>
      (!grupoFiltro || s.grupo === grupoFiltro) &&
      (!q || s.item.toLowerCase().includes(q)),
  )

  const porGrupo = GRUPO_ITEM_ORDEM.map((g) => ({
    grupo: g,
    itens: saldosFiltrados.filter((s) => s.grupo === g),
  })).filter((bloco) => bloco.itens.length > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Itens por quantidade</h1>
          <p className="text-sm text-muted-foreground">
            Acessórios, periféricos e componentes — saldo, atrelados e falta por filial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RealtimeRefresh />
          <LancarItemDialog itens={itensAtivos} filiais={filiais} ultimo={ultimo} />
        </div>
      </div>

      <ItensFiltros filiais={filiais} />

      {/* Saldos por item */}
      {porGrupo.length === 0 ? (
        <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum item no filtro atual.
        </p>
      ) : (
        <div className="space-y-4">
          {porGrupo.map((bloco) => (
            <section key={bloco.grupo} className="rounded-xl border bg-card">
              <h2 className="border-b px-4 py-2.5 text-sm font-semibold">
                {GRUPO_ITEM_META[bloco.grupo].titulo}
              </h2>
              <div className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Atrelados</TableHead>
                      <TableHead className="text-right">Falta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bloco.itens.map((s) => (
                      <TableRow key={s.item_id}>
                        <TableCell className="font-medium">{s.item}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {s.saldo.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {s.atrelados > 0 ? s.atrelados.toLocaleString('pt-BR') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.falta > 0 ? (
                            <Badge className="border-transparent bg-red-100 text-red-700 tabular-nums dark:bg-red-950 dark:text-red-300">
                              faltam {s.falta.toLocaleString('pt-BR')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Histórico de lançamentos */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Histórico de lançamentos</h2>
        <HistoricoLancamentos rows={historico.rows} />
        {historico.total > historico.pageSize && (
          <AtivosPaginacao
            page={historico.page}
            pageSize={historico.pageSize}
            total={historico.total}
          />
        )}
      </section>
    </div>
  )
}
