'use client'

import { useMemo, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronsUpDown, TriangleAlert } from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dica } from '@/components/ui/dica'
import { StatusBadge } from '@/components/ativos/status-badge'
import { CopiarPatrimonio } from '@/components/ativos/copiar-patrimonio'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import { formatDate, ouTraco } from '@/lib/format'
import { rotuloCategoria } from '@/lib/dominio'
import {
  ehColunaOrdenavel,
  parseOrdenacao,
  proximaDirecao,
  serializarOrdenacao,
  type ColunaOrdenavel,
  type DirecaoOrdenacao,
} from '@/lib/ativos/lista'
import { cn } from '@/lib/utils'
import type { AtivoLista } from '@/lib/queries/ativos'

// Revelação progressiva de colunas: em ~375px só cabem Patrimônio + Categoria +
// Status; as demais aparecem conforme a tela cresce, eliminando a rolagem
// horizontal longa no mobile (o ativo já é acessível pelo link do patrimônio).
const COL_RESP: Record<string, string> = {
  patrimonio: '',
  categoria: '',
  status: '',
  colaborador_atual: 'hidden sm:table-cell',
  modelo: 'hidden md:table-cell',
  filial_nome: 'hidden lg:table-cell',
  updated_at: 'hidden xl:table-cell',
}

export function AtivosTable({
  rows,
  duplicados,
}: {
  rows: AtivoLista[]
  // ATV-06 — o `resultado.patrimoniosDuplicados` de `listarAtivos` (Set dos
  // patrimônios que se repetem NA PÁGINA aberta). Antes virava uma coluna
  // condicional (`showServiceTag: boolean`) que aparecia e sumia a cada troca
  // de página — e nem aparecia no celular (`hidden lg:table-cell`), onde
  // desambiguar patrimônio repetido importa mais. Agora decide, LINHA A LINHA,
  // se a service tag daquela linha vira sublinha do patrimônio.
  duplicados: ReadonlySet<string>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  // Ordenar troca o searchParam na mesma rota (não dispara o loading.tsx): a
  // barra global dá o feedback, como já acontece nos filtros e na paginação.
  useReportarNavegacao(isPending)

  // A ordenação é SERVER-SIDE e mora na URL — a TanStack Table segue em modo
  // exibição (sem sorting client-side, que só reordenaria a página aberta).
  const ordenacao = parseOrdenacao(params.get('ord'))

  // Ciclo do cabeçalho: asc → desc → limpa (volta ao default `updated_at desc`).
  function alternarOrdem(coluna: ColunaOrdenavel) {
    const atual = ordenacao?.coluna === coluna ? ordenacao.direcao : null
    const proxima = proximaDirecao(atual)
    const novo = new URLSearchParams(params.toString())
    if (proxima) novo.set('ord', serializarOrdenacao({ coluna, direcao: proxima }))
    else novo.delete('ord')
    novo.delete('page') // reordenar volta p/ a página 1
    const qs = novo.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  const columns = useMemo<ColumnDef<AtivoLista>[]>(() => {
    const cols: ColumnDef<AtivoLista>[] = [
      {
        accessorKey: 'patrimonio',
        header: 'Patrimônio',
        cell: ({ row }) => {
          const { patrimonio, service_tag } = row.original
          // ATV-06 — a service tag vira sublinha SÓ quando o patrimônio desta
          // LINHA se repete na página (é justamente o par patrimônio+tag que
          // desambigua — spec §5) e há o que mostrar. Visível em qualquer
          // largura (sem `hidden …:table-cell`), diferente da antiga coluna.
          const mostrarServiceTag =
            patrimonio !== null && duplicados.has(patrimonio) && Boolean(service_tag)
          return (
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-0.5">
                <Link
                  href={`/ativos/${row.original.id}`}
                  className="font-medium tabular-nums underline-offset-4 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {patrimonio ?? (
                    <Badge
                      variant="outline"
                      className="font-normal text-muted-foreground"
                    >
                      sem patrimônio
                    </Badge>
                  )}
                </Link>
                {/* Ativo sem patrimônio (F7E) não tem o que copiar. O botão
                    para a propagação do clique — a LINHA navega por onClick. */}
                {patrimonio && <CopiarPatrimonio valor={patrimonio} />}
                {/* ATV-02 — indicador discreto de pendência (texto livre em
                    `ativos.pendencia`): só o ícone, sem faixa full-width — a
                    faixa âmbar completa já existe na ficha do ativo. */}
                {row.original.pendencia && (
                  <Dica texto={row.original.pendencia}>
                    <TriangleAlert
                      aria-hidden
                      className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500"
                    />
                    <span className="sr-only">
                      Pendência: {row.original.pendencia}
                    </span>
                  </Dica>
                )}
              </span>
              {mostrarServiceTag && (
                <span className="tabular-nums text-xs text-muted-foreground">
                  {service_tag}
                </span>
              )}
            </span>
          )
        },
      },
    ]

    cols.push(
      {
        accessorKey: 'categoria',
        header: 'Categoria',
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-normal">
            {rotuloCategoria(row.original.categoria)}
          </Badge>
        ),
      },
      {
        id: 'modelo',
        header: 'Marca / Modelo',
        cell: ({ row }) => {
          const { marca, modelo } = row.original
          const texto = [marca, modelo].filter(Boolean).join(' ')
          return <span>{texto || '—'}</span>
        },
      },
      {
        accessorKey: 'filial_nome',
        header: 'Filial',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'colaborador_atual',
        header: 'Colaborador',
        cell: ({ row }) => ouTraco(row.original.colaborador_atual),
      },
      {
        accessorKey: 'updated_at',
        header: 'Atualizado em',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDate(row.original.updated_at)}
          </span>
        ),
      },
    )

    return cols
  }, [duplicados])

  // TanStack Table retorna funcoes que o React Compiler nao memoiza; aqui a
  // tabela e so de exibicao (paginacao/filtros sao server-side), sem risco.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => {
                const colunaId = h.column.id
                const ordenavel = ehColunaOrdenavel(colunaId)
                // Direção ATIVA nesta coluna (null = ordenada por outra, ou por
                // nenhuma). Variável separada p/ o TS estreitar `ordenacao`.
                const direcao: DirecaoOrdenacao | null =
                  ordenavel && ordenacao?.coluna === colunaId
                    ? ordenacao.direcao
                    : null
                const rotulo = h.isPlaceholder
                  ? null
                  : flexRender(h.column.columnDef.header, h.getContext())
                return (
                  <TableHead
                    key={h.id}
                    // Coluna não ordenável não recebe aria-sort nenhum; as
                    // ordenáveis anunciam o estado (inclusive 'none').
                    aria-sort={
                      !ordenavel
                        ? undefined
                        : direcao === 'asc'
                          ? 'ascending'
                          : direcao === 'desc'
                            ? 'descending'
                            : 'none'
                    }
                    className={cn('whitespace-nowrap', COL_RESP[colunaId])}
                  >
                    {ordenavel ? (
                      // <button> de verdade: Tab chega, Enter/Espaço acionam.
                      // Sem `disabled` durante a transição de propósito: um
                      // <button> focado que fica desabilitado JOGA O FOCO PARA
                      // O BODY, e o teclado teria de recomeçar do topo da
                      // página a cada clique de ordenação.
                      <button
                        type="button"
                        onClick={() => alternarOrdem(colunaId)}
                        className={cn(
                          '-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium',
                          // F29/UXG-03 — o alvo era ~28px (só o padding), e é o
                          // controle mais tocado do cabeçalho. `min-h-10` no celular,
                          // `sm:min-h-0` de volta à densidade de antes no desktop —
                          // aqui é `min-h` (e não `h`) porque o botão é `inline-flex`
                          // dentro de um <th> e uma altura fixa desalinharia o texto
                          // dos cabeçalhos que NÃO ordenam.
                          'min-h-10 sm:min-h-0',
                          'transition-colors hover:text-foreground',
                          'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          direcao ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {rotulo}
                        {direcao === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : direcao === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ChevronsUpDown
                            className="size-3.5 opacity-40"
                            aria-hidden
                          />
                        )}
                      </button>
                    ) : (
                      rotulo
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() => router.push(`/ativos/${row.original.id}`)}
              className="cursor-pointer"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn('whitespace-nowrap', COL_RESP[cell.column.id])}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
