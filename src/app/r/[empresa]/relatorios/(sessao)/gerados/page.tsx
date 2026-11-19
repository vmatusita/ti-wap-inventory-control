import Link from 'next/link'
import { BarChart3, FileClock, MessageSquareText } from 'lucide-react'
import { pedirPorta } from '@/lib/supabase/publico'
import { sessaoDaPorta, tratarRecusa } from '@/lib/relatorios/porta-sessao'
import { caminhoDaPorta, filialForaDaPorta } from '@/lib/auth/porta-rotas'
import { ABA_RELATORIO_CONSOLIDADO } from '@/lib/auth/papeis'
import { paginaNumerica, selecaoFilialSlugs } from '@/lib/url-params'
import { formatDate, formatDateTime } from '@/lib/format'
import { notFound } from 'next/navigation'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { GeradosFiltroFilial } from '@/components/relatorios/gerados-filtro'
import { CabecalhoDaPagina, Pagina } from '@/components/layout/pagina'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { QuadroDeTabela } from '@/components/layout/quadro-de-tabela'
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

export const metadata = {
  title: 'Relatórios gerados',
}

export const maxDuration = 60

type SearchParams = { [key: string]: string | string[] | undefined }

// OS RELATÓRIOS GERADOS PELA PORTA PÚBLICA (F68): o arquivo semanal da empresa da SESSÃO — a empresa sai da sessão, por
// dentro do banco, nunca do slug (`relatorio_publico_dados`, pedido `gerados`). Sem o "Gerado por": quem gerou é nome de
// pessoa, e a porta não o devolve (decisão 19/11-2). O filtro de filial e a paginação são os mesmos componentes do
// operador (mexem só na URL desta rota). Filial do filtro que não é da empresa → 404 (`filialForaDaPorta`, o par da porta
// de `recusarFilialInexistente` — a lista de filiais vem da própria porta, nunca de `.from('filiais')`).
export default async function GeradosDaPortaPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>
  searchParams: Promise<SearchParams>
}) {
  const { empresa } = await params
  const sessao = await sessaoDaPorta(empresa)
  const slug = sessao.empresa.slug
  const sp = await searchParams
  const selecao = selecaoFilialSlugs(typeof sp.filial === 'string' ? sp.filial : undefined)
  const filtro: string[] = selecao.modo === 'lista' ? [...selecao.valores] : []

  const r = await pedirPorta('gerados', slug, sessao.token, {
    pagina: paginaNumerica(typeof sp.page === 'string' ? sp.page : undefined),
    filiais: filtro.length > 0 ? filtro : null,
  })
  if (!r.ok) tratarRecusa(slug, r.recusa)
  if (filialForaDaPorta(filtro, r.filiais)) notFound()

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Relatórios gerados"
        descricao={`O arquivo semanal de ${sessao.empresa.nome} — snapshots congelados e versionados.`}
        acoes={
          <>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={caminhoDaPorta(slug, ABA_RELATORIO_CONSOLIDADO)}>
                <BarChart3 className="size-4" />
                Ver ao vivo
              </Link>
            </Button>
            <GeradosFiltroFilial filiais={r.filiais} selecionados={filtro} />
          </>
        }
      />

      {r.linhas.length === 0 ? (
        filtro.length > 0 ? (
          <EstadoVazio
            icone={FileClock}
            titulo="Nenhum relatório para este filtro"
            descricao="Não há snapshot arquivado para as filiais escolhidas."
            acao={{ href: caminhoDaPorta(slug, 'gerados'), rotulo: 'Ver todas as filiais' }}
          />
        ) : (
          <EstadoVazio icone={FileClock} titulo="Nenhum relatório gerado ainda" />
        )
      ) : (
        <QuadroDeTabela>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead className="hidden md:table-cell">Em</TableHead>
                <TableHead className="text-right">Abrir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.linhas.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {formatDate(g.periodo_de)} – {formatDate(g.periodo_ate)}
                      {g.temObservacao && (
                        <span title="Tem observação da semana" aria-label="Tem observação da semana">
                          <MessageSquareText className="size-3.5 shrink-0 text-brand-amarelo" />
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{g.filialNome}</TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="tabular-nums">
                        v{g.versao}
                      </Badge>
                      {g.superada && (
                        <Badge variant="outline" className="border-callout-atencao-borda text-callout-atencao-texto">
                          superada
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                    {formatDateTime(g.gerado_em)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm" className="h-9 sm:h-7">
                      <Link href={caminhoDaPorta(slug, `gerados/${g.id}`)}>Abrir</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </QuadroDeTabela>
      )}

      {r.total > r.porPagina && <AtivosPaginacao page={r.pagina} pageSize={r.porPagina} total={r.total} />}
    </Pagina>
  )
}
