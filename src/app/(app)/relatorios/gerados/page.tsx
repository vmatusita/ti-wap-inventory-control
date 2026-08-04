import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, FileClock, MessageSquareText } from 'lucide-react'
import { resolverAcessoRelatorio } from '@/lib/auth/acesso'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarRelatoriosGerados } from '@/lib/queries/gerados'
import { resolverFiliaisSlugsSemPadrao } from '@/lib/filtros/filial'
import { rotaRelatorioPadrao } from '@/lib/relatorios/rota-padrao'
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
import { LinkAjuda } from '@/components/layout/link-ajuda'

type SearchParams = { [key: string]: string | string[] | undefined }

export default async function RelatoriosGeradosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const acesso = await resolverAcessoRelatorio()
  if (!acesso) redirect('/relatorios/acesso')

  const sp = await searchParams
  // F25 — multi-seleção, mas SEM padrão por cargo (decisão §4.7): o arquivo é
  // global e boa parte dele é de relatório CONSOLIDADO, que não pertence a filial
  // nenhuma; recortar por padrão esconderia justamente esses do operador. Esta é
  // também a única tela cujo filtro aceita o valor especial 'geral'.
  const filialFiltro = resolverFiliaisSlugsSemPadrao(
    typeof sp.filial === 'string' ? sp.filial : undefined,
  )

  // F25 — 'Ver ao vivo' leva ao mesmo destino por cargo da sidebar. No modo
  // VISUALIZADOR não há operador (nem cargo), e a função devolve o Consolidado —
  // que é exatamente o comportamento de antes para essa porta.
  const hrefAoVivo = await rotaRelatorioPadrao(
    acesso.modo === 'operador' ? acesso.operador : null,
  )

  const [filiais, gerados] = await Promise.all([
    listarFiliais(acesso.client),
    listarRelatoriosGerados(acesso.client, filialFiltro),
  ])

  // Slug cru era o que aparecia na mensagem de vazio ("cd-afonso-pena"). Com a
  // lista, traduzir passou a valer a pena: nome real quando a filial existe,
  // "Consolidado" para o valor especial, e o slug como último recurso (filtro
  // antigo de filial que sumiu — exatamente o caso que a mensagem explica).
  const rotulosDoFiltro = filialFiltro
    .map((s) =>
      s === 'geral' ? 'Consolidado' : (filiais.find((f) => f.slug === s)?.nome ?? s),
    )
    .join(', ')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Relatórios gerados
            </h1>
            {/* Só para o OPERADOR. Esta rota também é do visualizador por
                senha, e a documentação não é dele: o "?" o mandaria para
                /login. Mesma guarda (e mesmo motivo) da tela do relatório ao
                vivo. Achado da revisão adversarial da F20. */}
            {acesso.modo === 'operador' && (
              <LinkAjuda pagina="relatorios-gerados" rotulo="Ajuda sobre os relatórios gerados" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            O arquivo semanal — snapshots congelados e versionados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={hrefAoVivo}>
              <BarChart3 className="size-4" />
              Ver ao vivo
            </Link>
          </Button>
          <GeradosFiltroFilial filiais={filiais} selecionados={filialFiltro} />
        </div>
      </div>

      {/* Vazio COM filtro ≠ vazio sem filtro. `listarRelatoriosGerados` devolve []
          quando o slug do `?filial=` não resolve (favorito de filial renomeada, URL
          digitada) — e afirmar "Nenhum relatório gerado ainda" nesse caso diz que o
          arquivo semanal INTEIRO está vazio quando ele tem dezenas de snapshots. Era
          a mesma queixa do filtro ignorado, do outro lado: nada denunciava o filtro.
          Vale também para o filtro legítimo que simplesmente não tem snapshot. */}
      {gerados.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <FileClock className="size-8 text-muted-foreground" />
          {filialFiltro.length > 0 ? (
            <>
              <p className="font-medium">Nenhum relatório para este filtro</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Não há snapshot arquivado para{' '}
                <span className="font-medium">{rotulosDoFiltro}</span>. Pode ser um
                filtro antigo, ou uma filial que mudou de endereço — o arquivo das
                outras filiais continua aqui.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link href="/relatorios/gerados">Ver todas as filiais</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="font-medium">Nenhum relatório gerado ainda</p>
              <p className="text-sm text-muted-foreground">
                Gere o relatório da semana na página ao vivo — ele fica arquivado aqui.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead className="hidden md:table-cell">Gerado por</TableHead>
                <TableHead className="hidden md:table-cell">Em</TableHead>
                <TableHead className="text-right">Abrir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gerados.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {formatDate(g.periodo_de)} – {formatDate(g.periodo_ate)}
                      {g.temObservacao && (
                        <span
                          title="Tem observação da semana"
                          aria-label="Tem observação da semana"
                        >
                          <MessageSquareText className="size-3.5 shrink-0 text-brand-amarelo" />
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{g.filialNome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="tabular-nums">
                      v{g.versao}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap md:table-cell">
                    {ouTraco(g.autorNome)}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                    {formatDateTime(g.gerado_em)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm" className="h-9 sm:h-7">
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
