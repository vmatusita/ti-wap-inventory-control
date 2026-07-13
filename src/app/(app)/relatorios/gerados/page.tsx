import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, FileClock } from 'lucide-react'
import { resolverAcessoRelatorio } from '@/lib/auth/acesso'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarRelatoriosGerados } from '@/lib/queries/gerados'
import { formatDate, formatDateTime, ouTraco } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GeradosFiltroFilial } from '@/components/relatorios/gerados-filtro'

type SearchParams = { [key: string]: string | string[] | undefined }

export default async function RelatoriosGeradosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const acesso = await resolverAcessoRelatorio()
  if (!acesso) redirect('/relatorios/acesso')

  const sp = await searchParams
  const filialFiltro = typeof sp.filial === 'string' ? sp.filial : undefined

  const [filiais, gerados] = await Promise.all([
    listarFiliais(acesso.client),
    listarRelatoriosGerados(acesso.client, filialFiltro),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Relatórios gerados
          </h1>
          <p className="text-sm text-muted-foreground">
            O arquivo semanal — snapshots congelados e versionados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/relatorios/geral">
              <BarChart3 className="size-4" />
              Ver ao vivo
            </Link>
          </Button>
          <GeradosFiltroFilial filiais={filiais} atual={filialFiltro ?? ''} />
        </div>
      </div>

      {gerados.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <FileClock className="size-8 text-muted-foreground" />
          <p className="font-medium">Nenhum relatório gerado ainda</p>
          <p className="text-sm text-muted-foreground">
            Gere o relatório da semana na página ao vivo — ele fica arquivado aqui.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Gerado por</TableHead>
                <TableHead>Em</TableHead>
                <TableHead className="text-right">Abrir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gerados.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDate(g.periodo_de)} – {formatDate(g.periodo_ate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{g.filialNome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="tabular-nums">
                      v{g.versao}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {ouTraco(g.autorNome)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDateTime(g.gerado_em)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/relatorios/gerados/${g.id}`}>Abrir</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
