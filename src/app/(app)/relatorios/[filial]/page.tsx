import { notFound, redirect } from 'next/navigation'
import { resolverAcessoRelatorio } from '@/lib/auth/acesso'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  CAPS,
  getSnapshotRelatorio,
  resolverFilialPorSlug,
} from '@/lib/queries/relatorios'
import { resolverPeriodo, semanaUtilCorrente } from '@/lib/relatorios/periodo'
import { exportarMovimentacoesRelatorio } from '@/lib/actions/relatorios'
import { formatDate } from '@/lib/format'
import { FilialTabs } from '@/components/relatorios/filial-tabs'
import { PeriodoFiltro } from '@/components/relatorios/periodo-filtro'
import { CorpoRelatorio } from '@/components/relatorios/corpo-relatorio'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'
import { ViewerAutoRefresh } from '@/components/relatorios/viewer-auto-refresh'
import { GerarRelatorioDialog } from '@/components/relatorios/gerar-relatorio-dialog'
import { BotaoImprimir } from '@/components/relatorios/botao-imprimir'

type SearchParams = { [key: string]: string | string[] | undefined }

function primeiro(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
}

export default async function RelatorioFilialPage({
  params,
  searchParams,
}: {
  params: Promise<{ filial: string }>
  searchParams: Promise<SearchParams>
}) {
  const { filial: filialSlug } = await params
  const sp = await searchParams

  const acesso = await resolverAcessoRelatorio()
  if (!acesso) redirect('/relatorios/acesso')

  const periodo = resolverPeriodo({
    preset: primeiro(sp.preset),
    de: primeiro(sp.de),
    ate: primeiro(sp.ate),
  })

  if (filialSlug !== 'geral') {
    const f = await resolverFilialPorSlug(acesso.client, filialSlug)
    if (!f) notFound()
  }

  const [filiais, snapshot] = await Promise.all([
    listarFiliais(acesso.client),
    getSnapshotRelatorio(
      acesso.client,
      filialSlug,
      { de: periodo.de, ate: periodo.ate, rotulo: periodo.rotulo },
      { maxMovimentacoes: CAPS.aoVivo },
    ),
  ])

  const nomeArquivo = `relatorio-${filialSlug}-${periodo.ate}.csv`
  const semana = semanaUtilCorrente()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Relatório — {snapshot.meta.filialNome}
          </h1>
          <p className="text-sm text-muted-foreground">
            {periodo.rotulo} · {formatDate(periodo.de)} a {formatDate(periodo.ate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acesso.modo === 'operador' ? <RealtimeRefresh /> : <ViewerAutoRefresh />}
          {acesso.modo === 'operador' && (
            <GerarRelatorioDialog
              filialSlug={filialSlug}
              filialNome={snapshot.meta.filialNome}
              ehGeral={snapshot.meta.ehGeral}
              padraoDe={semana.de}
              padraoAte={semana.ate}
            />
          )}
          <BotaoImprimir />
        </div>
      </div>

      <FilialTabs filiais={filiais} atual={filialSlug} />
      <PeriodoFiltro preset={periodo.preset} de={periodo.de} ate={periodo.ate} />

      <CorpoRelatorio
        snapshot={snapshot}
        nomeArquivoCsv={nomeArquivo}
        carregarExport={exportarMovimentacoesRelatorio.bind(
          null,
          filialSlug,
          periodo.de,
          periodo.ate,
        )}
      />
    </div>
  )
}
