import { redirect } from 'next/navigation'
import { differenceInCalendarDays } from 'date-fns'
import { getOperador } from '@/lib/auth/acesso'
import { createClient } from '@/lib/supabase/server'
import { getPendencias } from '@/lib/queries/relatorios'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarPendencias, type TipoPendencia } from '@/lib/queries/pendencias-detalhe'
import { paginaNumerica } from '@/lib/url-params'
import { formatDate } from '@/lib/format'
import { ClipboardCheck, Filter } from 'lucide-react'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import { exportarPendenciasCSV } from '@/lib/actions/exportar'
import { PendenciasChips } from '@/components/relatorios/pendencias-chips'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { PendenciasFiltros } from '@/components/pendencias/pendencias-filtros'
import {
  FilaPendenciasTabela,
  type LinhaFila,
} from '@/components/pendencias/fila-pendencias-tabela'

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

const TIPOS_VALIDOS: TipoPendencia[] = ['termo', 'itens', 'triagem', 'patrimonio', 'outras']

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
  // Teto de página (F12-W4-01): sem ele `?page=99999999999999999999` vira 1e20,
  // o postgrest-js serializa `offset=3e+21`, o PostgREST descarta o offset EM
  // SILÊNCIO (200, sem PGRST103) e a paginação trava com notação científica no
  // rodapé. Página válida mas além do fim cai no fallback PGRST103 da query.
  const page = paginaNumerica(primeiro(sp.page))
  // Diferencia "não há pendência nenhuma" de "nada neste filtro" no estado vazio.
  const temFiltro = Boolean(filialSlug || tipo || q)

  const client = await createClient()
  const [filiais, chips, lista] = await Promise.all([
    listarFiliais(client),
    getPendencias(client, filialSlug),
    listarPendencias({ filialSlug, tipo, q, page }),
  ])

  // "Desde" formatado no SERVIDOR (formatDate + "há N dias") — a tabela é Client
  // Component (seleção/resolução em lote) e não deve recalcular datas no cliente
  // (mismatch de hidratação na virada do dia).
  const linhas: LinhaFila[] = lista.rows.map((r) => ({
    ...r,
    desdeFmt: formatDate(r.desde),
    desdeRel: haQuantosDias(r.desde),
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Pendências</h1>
            <LinkAjuda ancora="pendencias" rotulo="Ajuda sobre pendências" />
          </div>
          <p className="text-sm text-muted-foreground">
            Ativos que precisam de ação — termos, devoluções com itens faltantes e
            triagem parada. Uso interno da TI.
          </p>
        </div>
        <ExportarCsvButton
          acao={exportarPendenciasCSV}
          descricao="das pendências filtradas"
        />
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
          <FilaPendenciasTabela rows={linhas} />
        )}
      </div>

      {lista.total > lista.pageSize && (
        <AtivosPaginacao page={lista.page} pageSize={lista.pageSize} total={lista.total} />
      )}
    </div>
  )
}
