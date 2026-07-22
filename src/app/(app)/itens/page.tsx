import { redirect } from 'next/navigation'
import { PackageOpen, PackagePlus } from 'lucide-react'
import { getOperador } from '@/lib/auth/acesso'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  getHistoricoLancamentos,
  getSaldosItens,
  getUltimoLancamento,
  listarItensAtivos,
} from '@/lib/queries/itens'
import {
  GRUPO_ITEM_META,
  GRUPO_ITEM_ORDEM,
  type GrupoItem,
  type TipoLancamento,
} from '@/lib/dominio'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { ItensFiltros } from '@/components/itens/itens-filtros'
import { HistoricoFiltros } from '@/components/itens/historico-filtros'
import { LancarItemDialog } from '@/components/itens/lancar-item-dialog'
import { LancarItemLinha } from '@/components/itens/lancar-item-linha'
import { HistoricoLancamentos } from '@/components/itens/historico-lancamentos'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

// Params do histórico (F9 · I3) são validados aqui: qualquer valor fora do
// formato é IGNORADO (nunca derruba a página nem vira filtro inválido no banco).
// A FAIXA importa tanto quanto o formato: `item_id` e `filial_id` são `smallint`
// (migration 0015), então `?item=99999` — formato válido — faria o Postgres
// recusar o literal (22003) e a leitura lançaria no Server Component, derrubando
// a página. Achado da revisão adversarial da F9.
const MAX_SMALLINT = 32767

function idNumerico(v: string | undefined): number | null {
  if (!v || !/^\d+$/.test(v)) return null
  const n = Number(v)
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_SMALLINT ? n : null
}

// Lista explícita (não `in TIPO_LANCAMENTO_META`, que aceitaria chaves herdadas
// do prototype — `?tipo=constructor` viraria um cast inválido de enum no banco).
const TIPOS_LANCAMENTO: readonly TipoLancamento[] = [
  'entrada',
  'saida',
  'reserva',
  'liberacao',
  'retorno',
  'ajuste',
]

function tipoValido(v: string | undefined): TipoLancamento | null {
  return v && (TIPOS_LANCAMENTO as readonly string[]).includes(v)
    ? (v as TipoLancamento)
    : null
}

function dataISO(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  // Descarta data inexistente (ex.: 2026-02-31, que o Date "rolaria" para março).
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

export default async function ItensPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const sp = await searchParams
  const filialId = idNumerico(primeiro(sp.filial))
  const grupoFiltro = primeiro(sp.grupo) as GrupoItem | undefined
  const q = (primeiro(sp.q) ?? '').trim().toLowerCase()
  const page = Math.max(1, Number(primeiro(sp.page) ?? '1') || 1)

  // Filtros só do histórico (a filial vale para os dois blocos).
  const itemFiltro = idNumerico(primeiro(sp.item))
  const tipoFiltro = tipoValido(primeiro(sp.tipo))
  const deFiltro = dataISO(primeiro(sp.de))
  const ateFiltro = dataISO(primeiro(sp.ate))

  const [filiais, itensAtivos, saldos, ultimo, historico] = await Promise.all([
    listarFiliais(),
    listarItensAtivos(),
    getSaldosItens(filialId),
    getUltimoLancamento(operador.id),
    getHistoricoLancamentos({
      filialId,
      itemId: itemFiltro,
      tipo: tipoFiltro,
      de: deFiltro,
      ate: ateFiltro,
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

  const temFiltroSaldos = Boolean(q || grupoFiltro || filialId)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Itens por quantidade</h1>
          <p className="text-sm text-muted-foreground">
            Acessórios, periféricos e componentes — total, estoque, atrelados e falta por filial.
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
        itensAtivos.length === 0 ? (
          <EstadoVazio
            icone={PackagePlus}
            titulo="Nenhum item no catálogo"
            descricao="Cadastre o catálogo em Administração → Itens para começar a lançar quantidades."
            acao={{ href: '/admin/itens', rotulo: 'Ir para Administração → Itens' }}
          />
        ) : temFiltroSaldos ? (
          <EstadoVazio
            icone={PackageOpen}
            titulo="Nenhum item com esses filtros"
            descricao="Ajuste a busca, o grupo ou a filial para ver os saldos."
          />
        ) : (
          <EstadoVazio
            icone={PackageOpen}
            titulo="Nenhum saldo ainda"
            descricao="Os saldos aparecem aqui assim que houver o primeiro lançamento."
          />
        )
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
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Estoque</TableHead>
                      <TableHead className="text-right">Atrelados</TableHead>
                      <TableHead className="text-right">Falta</TableHead>
                      <TableHead className="w-px text-right">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bloco.itens.map((s) => (
                      <TableRow key={s.item_id}>
                        <TableCell className="font-medium">{s.item}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {s.total.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {s.estoque.toLocaleString('pt-BR')}
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
                        <TableCell className="py-1 text-right">
                          <LancarItemLinha
                            itemId={s.item_id}
                            item={s.item}
                            filialId={filialId}
                          />
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
        <HistoricoFiltros itens={itensAtivos} />
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
