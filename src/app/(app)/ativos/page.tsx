import { listarAtivos } from '@/lib/queries/ativos'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  CATEGORIA_ORDEM,
  STATUS_ORDEM,
  type CategoriaAtivo,
  type StatusAtivo,
} from '@/lib/dominio'
import { AtivosFiltros } from '@/components/ativos/ativos-filtros'
import { AtivosTable } from '@/components/ativos/ativos-table'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { PackageOpen } from 'lucide-react'

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export default async function AtivosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams

  const q = texto(sp.q)
  const filialRaw = texto(sp.filial)
  const filialId = filialRaw && /^\d+$/.test(filialRaw) ? Number(filialRaw) : undefined

  const categoriaRaw = texto(sp.categoria)
  const categoria = CATEGORIA_ORDEM.includes(categoriaRaw as CategoriaAtivo)
    ? (categoriaRaw as CategoriaAtivo)
    : undefined

  const status = (texto(sp.status) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StatusAtivo => STATUS_ORDEM.includes(s as StatusAtivo))

  const pageRaw = texto(sp.page)
  const page = pageRaw && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 1

  const [filiais, resultado] = await Promise.all([
    listarFiliais(),
    listarAtivos({ q, filialId, categoria, status, page }),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ativos</h1>
        <p className="text-sm text-muted-foreground">
          {resultado.total.toLocaleString('pt-BR')} ativos cadastrados
        </p>
      </div>

      <AtivosFiltros filiais={filiais} />

      {resultado.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <PackageOpen className="size-8 text-muted-foreground" />
          <p className="font-medium">Nenhum ativo encontrado com esses filtros</p>
          <p className="text-sm text-muted-foreground">
            Ajuste a busca ou limpe os filtros para ver todos os ativos.
          </p>
        </div>
      ) : (
        <>
          <AtivosTable
            rows={resultado.rows}
            showServiceTag={resultado.patrimoniosDuplicados.size > 0}
          />
          <AtivosPaginacao
            page={resultado.page}
            pageSize={resultado.pageSize}
            total={resultado.total}
          />
        </>
      )}
    </div>
  )
}
