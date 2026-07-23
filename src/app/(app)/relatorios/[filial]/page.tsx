import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { FileClock } from 'lucide-react'
import { resolverAcessoRelatorio } from '@/lib/auth/acesso'
import { Button } from '@/components/ui/button'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  getSnapshotRelatorioV2,
  resolverFilialPorSlug,
} from '@/lib/queries/relatorios'
import { resolverPeriodo, semanaUtilCorrente } from '@/lib/relatorios/periodo'
import { formatDate, hojeISO } from '@/lib/format'
import { FilialTabs } from '@/components/relatorios/filial-tabs'
import { PeriodoFiltro } from '@/components/relatorios/periodo-filtro'
import { CorpoRelatorio } from '@/components/relatorios/corpo-relatorio'
import { RealtimeRefresh } from '@/components/relatorios/realtime-refresh'
import { ViewerAutoRefresh } from '@/components/relatorios/viewer-auto-refresh'
import { GerarRelatorioDialog } from '@/components/relatorios/gerar-relatorio-dialog'
import { BotaoImprimir } from '@/components/relatorios/botao-imprimir'
import { LinkAjuda } from '@/components/layout/link-ajuda'

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

  const ehOperador = acesso.modo === 'operador'

  const [filiais, snapshot] = await Promise.all([
    listarFiliais(acesso.client),
    getSnapshotRelatorioV2(
      acesso.client,
      filialSlug,
      { de: periodo.de, ate: periodo.ate, rotulo: periodo.rotulo },
      ehOperador, // viewer → sem pendências no snapshot ao vivo
    ),
  ])

  const semana = semanaUtilCorrente()
  // Teto do dialog "Gerar relatório": hoje ou o fim da semana útil (o maior) —
  // permite a sexta-padrão gerada no meio da semana, barra futuro arbitrário.
  const tetoData = hojeISO() > semana.ate ? hojeISO() : semana.ate

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Relatório — {snapshot.meta.filialNome}
            </h1>
            {/* Só para o operador: o visualizador por senha não passa do
                /relatorios/** (o proxy manda o resto para /login) — um "?" que
                desloga o gestor seria pior que "?" nenhum. */}
            {ehOperador && (
              <LinkAjuda ancora="relatorios" rotulo="Ajuda sobre os relatórios" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {periodo.rotulo} · {formatDate(periodo.de)} a {formatDate(periodo.ate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acesso.modo === 'operador' ? <RealtimeRefresh /> : <ViewerAutoRefresh />}
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 sm:h-7">
            <Link href="/relatorios/gerados" aria-label="Relatórios gerados">
              <FileClock className="size-4" />
              <span className="hidden sm:inline">Relatórios gerados</span>
            </Link>
          </Button>
          {acesso.modo === 'operador' && (
            <GerarRelatorioDialog
              filialSlug={filialSlug}
              filialNome={snapshot.meta.filialNome}
              ehGeral={snapshot.meta.ehGeral}
              padraoDe={semana.de}
              padraoAte={semana.ate}
              maxData={tetoData}
            />
          )}
          <BotaoImprimir />
        </div>
      </div>

      <div className="space-y-3">
        <FilialTabs filiais={filiais} atual={filialSlug} />
        <PeriodoFiltro preset={periodo.preset} de={periodo.de} ate={periodo.ate} />
      </div>

      <CorpoRelatorio snapshot={snapshot} ehOperador={ehOperador} />
    </div>
  )
}
