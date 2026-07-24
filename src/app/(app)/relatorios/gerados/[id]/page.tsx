import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, FileText, TriangleAlert } from 'lucide-react'
import { resolverAcessoRelatorio } from '@/lib/auth/acesso'
import { buscarRelatorioGerado } from '@/lib/queries/gerados'
import { formatDate, formatDateTime, ouTraco } from '@/lib/format'
import { CorpoRelatorio } from '@/components/relatorios/corpo-relatorio'
import { BotaoImprimir } from '@/components/relatorios/botao-imprimir'

export default async function RelatorioGeradoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const acesso = await resolverAcessoRelatorio()
  if (!acesso) redirect('/relatorios/acesso')
  const ehOperador = acesso.modo === 'operador'

  const detalhe = await buscarRelatorioGerado(acesso.client, id)
  if (!detalhe) notFound()

  const s = detalhe.snapshot

  return (
    <div className="space-y-4">
      <Link
        href="/relatorios/gerados"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="size-4" />
        Relatórios gerados
      </Link>

      {/* Banner fixo: relatório congelado (OS-F3 3.8.5) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2.5 text-sm">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span>
          <strong>Relatório gerado</strong> · {s.meta.filialNome} ·{' '}
          {formatDate(detalhe.periodo_de)} a {formatDate(detalhe.periodo_ate)} ·{' '}
          versão {detalhe.versao} · por {ouTraco(detalhe.autorNome)} em{' '}
          {formatDateTime(detalhe.gerado_em)}
        </span>
        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium">
          dados congelados
        </span>
      </div>

      {detalhe.versaoMaisNova && (
        <Link
          href={`/relatorios/gerados/${detalhe.versaoMaisNova.id}`}
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60 print:hidden"
        >
          <TriangleAlert className="size-4 shrink-0" />
          Existe a versão {detalhe.versaoMaisNova.versao} deste relatório — abrir a
          mais recente.
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Relatório — {s.meta.filialNome}
          </h1>
          <p className="text-sm text-muted-foreground">
            Snapshot de {formatDate(detalhe.periodo_de)} a{' '}
            {formatDate(detalhe.periodo_ate)}
          </p>
        </div>
        <BotaoImprimir />
      </div>

      <CorpoRelatorio snapshot={s} ehOperador={ehOperador} />
    </div>
  )
}
