import { redirect } from 'next/navigation'
import Link from 'next/link'
import { differenceInCalendarDays } from 'date-fns'
import { getOperador } from '@/lib/auth/acesso'
import { createClient } from '@/lib/supabase/server'
import { getPendencias } from '@/lib/queries/relatorios'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  listarPendencias,
  type TipoPendencia,
} from '@/lib/queries/pendencias-detalhe'
import { rotuloCategoria } from '@/lib/dominio'
import { formatDate } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, Filter, PenLine } from 'lucide-react'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { PendenciasChips } from '@/components/relatorios/pendencias-chips'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { PendenciasFiltros } from '@/components/pendencias/pendencias-filtros'
import { ConfirmarAssinaturaDialog } from '@/components/ativos/confirmar-assinatura-dialog'

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

const TIPOS_VALIDOS: TipoPendencia[] = ['termo', 'itens', 'triagem', 'patrimonio', 'outras']

const BADGE_TIPO: Record<TipoPendencia, { rotulo: string; classe: string }> = {
  termo: { rotulo: 'Termo', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  itens: { rotulo: 'Itens faltantes', classe: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  triagem: { rotulo: 'Triagem', classe: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  patrimonio: { rotulo: 'Patrimônio', classe: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  outras: { rotulo: 'Outra', classe: 'bg-muted text-muted-foreground' },
}

function haQuantosDias(iso: string | null): string {
  if (!iso) return ''
  const dias = differenceInCalendarDays(new Date(), new Date(iso))
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

export default async function PendenciasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

  const sp = await searchParams
  const filialSlug = primeiro(sp.filial) || null
  const tipoRaw = primeiro(sp.tipo)
  const tipo = TIPOS_VALIDOS.includes(tipoRaw as TipoPendencia)
    ? (tipoRaw as TipoPendencia)
    : null
  const q = (primeiro(sp.q) ?? '').trim() || null
  const page = Math.max(1, Number(primeiro(sp.page) ?? '1') || 1)
  // Diferencia "não há pendência nenhuma" de "nada neste filtro" no estado vazio.
  const temFiltro = Boolean(filialSlug || tipo || q)

  const client = await createClient()
  const [filiais, chips, lista] = await Promise.all([
    listarFiliais(client),
    getPendencias(client, filialSlug),
    listarPendencias({ filialSlug, tipo, q, page }),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pendências</h1>
        <p className="text-sm text-muted-foreground">
          Ativos que precisam de ação — termos, devoluções com itens faltantes e
          triagem parada. Uso interno da TI.
        </p>
      </div>

      {/* KPI-chips (reuso de getPendencias — total por bucket) */}
      <PendenciasChips pendencias={chips} />

      <PendenciasFiltros filiais={filiais} filialSlug={filialSlug} tipo={tipo} q={q} />

      <div className="rounded-xl border bg-card">
        {lista.rows.length === 0 ? (
          // "Não há pendência nenhuma" (comemorar) x "nada neste filtro" (ajustar).
          // `lista.total` cobre também a página fora de faixa (?page=9 sem filtro).
          !temFiltro && lista.total === 0 ? (
            <EstadoVazio
              icone={ClipboardCheck}
              titulo="Nenhuma pendência aberta 🎉"
              descricao="Nenhum ativo com termo pendente, triagem parada, itens faltantes ou patrimônio a acertar."
              className="border-0"
            />
          ) : (
            <EstadoVazio
              icone={Filter}
              titulo="Nenhuma pendência neste filtro"
              descricao="Nada nesta combinação de filtros — o que não quer dizer que não haja pendências. Ajuste ou limpe os filtros para ver todas."
              acao={{ href: '/pendencias', rotulo: 'Limpar filtros' }}
              className="border-0"
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Desde</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.rows.map((p) => {
                const badge = BADGE_TIPO[p.tipo]
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge className={`border-transparent ${badge.classe}`}>
                        {badge.rotulo}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      <Link
                        href={`/ativos/${p.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {p.patrimonio ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[p.marca, p.modelo].filter(Boolean).join(' ') ||
                        (p.categoria ? rotuloCategoria(p.categoria) : '—')}
                    </TableCell>
                    <TableCell>{p.colaborador ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.setor ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.filialNome ?? p.filialSlug ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span>{formatDate(p.desde)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {haQuantosDias(p.desde)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.tipo === 'termo' && (
                        <ConfirmarAssinaturaDialog
                          ativoId={p.id}
                          trigger={
                            <Button variant="outline" size="sm" className="h-8 gap-1.5">
                              <PenLine className="size-3.5" />
                              Confirmar assinatura
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {lista.total > lista.pageSize && (
        <AtivosPaginacao page={lista.page} pageSize={lista.pageSize} total={lista.total} />
      )}
    </div>
  )
}
