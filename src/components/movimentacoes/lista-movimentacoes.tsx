import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'
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
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { formatDate, ouTraco } from '@/lib/format'
import { pillTipo, rotuloTipo } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { MovimentacaoLista } from '@/lib/queries/movimentacoes'

// Revelação progressiva (mesma ideia de `ativos-table.tsx`): em ~375px só cabem
// Data, Tipo e Patrimônio; o resto aparece conforme a tela cresce. O evento
// inteiro continua a um toque de distância, pela ficha do ativo.
const COL_COLABORADOR = 'hidden sm:table-cell'
const COL_FILIAL = 'hidden md:table-cell'
const COL_OBS = 'hidden lg:table-cell'
const COL_OPERADOR = 'hidden xl:table-cell'

// Lista de movimentações (F11 · M8). Server Component: nada aqui é interativo
// além do tooltip da observação, que tem a própria fronteira `'use client'`.
// Uma linha por movimentação, da mais recente para a mais antiga.
export function ListaMovimentacoes({
  rows,
  temFiltro,
}: {
  rows: MovimentacaoLista[]
  temFiltro: boolean
}) {
  if (rows.length === 0) {
    return temFiltro ? (
      <EstadoVazio
        icone={ArrowLeftRight}
        titulo="Nenhuma movimentação com esses filtros"
        descricao="Ajuste o período, o tipo, a filial ou a busca — ou limpe os filtros para ver tudo."
      />
    ) : (
      <EstadoVazio
        icone={ArrowLeftRight}
        titulo="Nenhuma movimentação registrada ainda"
        descricao="Toda saída, devolução, transferência ou manutenção aparece aqui assim que for registrada."
        acao={{ href: '/movimentacoes/nova', rotulo: 'Registrar a primeira' }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Patrimônio</TableHead>
            <TableHead className={COL_COLABORADOR}>Colaborador</TableHead>
            <TableHead className={COL_FILIAL}>Filial</TableHead>
            <TableHead className={COL_OPERADOR}>Operador</TableHead>
            <TableHead className={COL_OBS}>Obs.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id} className={cn(m.estornada && 'opacity-60')}>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                {formatDate(m.data)}
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <span
                  className={cn(
                    'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    pillTipo(m.tipo),
                  )}
                >
                  {rotuloTipo(m.tipo)}
                </span>
                {/* Mesma linguagem da linha do tempo: a movimentação DESFEITA
                    fica esmaecida e marcada; o estorno se identifica. */}
                {m.ehEstorno && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    (estorno)
                  </span>
                )}
                {m.estornada && !m.ehEstorno && (
                  <span className="ml-1 text-[10px] font-medium text-destructive">
                    (estornada)
                  </span>
                )}
              </TableCell>

              <TableCell className="whitespace-nowrap">
                <Link
                  href={`/ativos/${m.ativo_id}`}
                  className="rounded-sm font-medium tabular-nums underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {m.patrimonio ?? (
                    // Ativo sem patrimônio físico (import F7E) — o link continua,
                    // é o único caminho para a ficha.
                    <Badge
                      variant="outline"
                      className="font-normal text-muted-foreground"
                    >
                      sem patrimônio
                    </Badge>
                  )}
                </Link>
                {/* Patrimônio repete em casos raros (spec §5): buscar um deles
                    traz o histórico de DOIS ativos intercalado. A service tag
                    desempata na própria linha — mesmo chip da paleta de comandos
                    e da coluna Service Tag de /ativos. */}
                {m.patrimonio_duplicado && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-[11px] tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ST {m.service_tag ?? '—'}
                  </span>
                )}
              </TableCell>

              <TableCell className={cn('whitespace-nowrap', COL_COLABORADOR)}>
                {ouTraco(m.colaborador)}
              </TableCell>

              <TableCell
                className={cn(
                  'whitespace-nowrap text-muted-foreground',
                  COL_FILIAL,
                )}
              >
                {ouTraco(m.filial_nome)}
              </TableCell>

              <TableCell
                className={cn(
                  'whitespace-nowrap text-muted-foreground',
                  COL_OPERADOR,
                )}
              >
                {ouTraco(m.autor_nome)}
              </TableCell>

              <TableCell className={COL_OBS}>
                <div className="max-w-[220px]">
                  <ObsTooltip
                    texto={m.observacao}
                    comIcone
                    className="w-full text-xs"
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
