'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { StatusBadge } from '@/components/ativos/status-badge'
import { formatDate, ouTraco } from '@/lib/format'
import { rotuloCategoria } from '@/lib/dominio'
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
  service_tag: 'hidden lg:table-cell',
  filial_nome: 'hidden lg:table-cell',
  updated_at: 'hidden xl:table-cell',
}

export function AtivosTable({
  rows,
  showServiceTag,
}: {
  rows: AtivoLista[]
  showServiceTag: boolean
}) {
  const router = useRouter()

  const columns = useMemo<ColumnDef<AtivoLista>[]>(() => {
    const cols: ColumnDef<AtivoLista>[] = [
      {
        accessorKey: 'patrimonio',
        header: 'Patrimônio',
        cell: ({ row }) => (
          <Link
            href={`/ativos/${row.original.id}`}
            className="font-medium tabular-nums underline-offset-4 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.patrimonio}
          </Link>
        ),
      },
    ]

    if (showServiceTag) {
      cols.push({
        accessorKey: 'service_tag',
        header: 'Service Tag',
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.service_tag ?? '—'}
          </span>
        ),
      })
    }

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
  }, [showServiceTag])

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
              {hg.headers.map((h) => (
                <TableHead
                  key={h.id}
                  className={cn('whitespace-nowrap', COL_RESP[h.column.id])}
                >
                  {h.isPlaceholder
                    ? null
                    : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
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
