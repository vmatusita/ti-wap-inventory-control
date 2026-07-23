import { listarAtivos } from '@/lib/queries/ativos'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  CATEGORIA_ORDEM,
  STATUS_ORDEM,
  type CategoriaAtivo,
  type StatusAtivo,
} from '@/lib/dominio'
import {
  TAMANHOS_PAGINA,
  parseOrdenacao,
  parseTamanhoPagina,
} from '@/lib/ativos/lista'
import Link from 'next/link'
import { AtivosFiltros } from '@/components/ativos/ativos-filtros'
import { AtivosTable } from '@/components/ativos/ativos-table'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { Button } from '@/components/ui/button'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { exportarAtivosCSV } from '@/lib/actions/exportar'
import { PackageOpen, PackagePlus } from 'lucide-react'

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

// `filial_id` é smallint (migration 0015): validar só o FORMATO deixa passar
// `?filial=99999`, que o Postgres recusa (22003) e derruba o Server Component —
// a mesma classe de bug que a F9 corrigiu em /itens. Guarda idêntica à do
// parser de filtros do export (`lib/actions/exportar.ts`), que é quem monta o
// CSV desta mesma tela: página e botão não podem discordar.
const MAX_SMALLINT = 32767

function idNumerico(v: string | undefined): number | undefined {
  if (!v || !/^\d+$/.test(v)) return undefined
  const n = Number(v)
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_SMALLINT ? n : undefined
}

export default async function AtivosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams

  const q = texto(sp.q)
  const filialId = idNumerico(texto(sp.filial))

  const categoriaRaw = texto(sp.categoria)
  const categoria = CATEGORIA_ORDEM.includes(categoriaRaw as CategoriaAtivo)
    ? (categoriaRaw as CategoriaAtivo)
    : undefined

  const status = (texto(sp.status) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StatusAtivo => STATUS_ORDEM.includes(s as StatusAtivo))

  // Teto de 7 dígitos (cobre qualquer acervo plausível): validar só o formato
  // deixaria passar `?page=99999999999999999999`, que vira 1e20 e faz o `offset`
  // do PostgREST sair em notação científica ("3e+21") — descartado em silêncio
  // pelo servidor, então a página nunca recebe o PGRST103 que `listarAtivos`
  // sabe tratar e a paginação trava. Acima do teto, volta à página 1.
  const pageRaw = texto(sp.page)
  const page = pageRaw && /^\d{1,7}$/.test(pageRaw) ? Number(pageRaw) : 1

  const semPatrimonio = texto(sp.semPatrimonio) === '1'

  // F11/T7 — ordenação e tamanho de página vêm da URL. Param torto é IGNORADO
  // (cai no default `updated_at desc` / 50 por página), nunca derruba a tela.
  const ordenacao = parseOrdenacao(sp.ord)
  const pageSize = parseTamanhoPagina(sp.pp) ?? undefined

  const [filiais, resultado] = await Promise.all([
    listarFiliais(),
    listarAtivos({
      q,
      filialId,
      categoria,
      status,
      semPatrimonio,
      page,
      pageSize,
      ordenacao,
    }),
  ])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Ativos</h1>
            <LinkAjuda ancora="status" rotulo="Ajuda: o que cada status significa" />
          </div>
          <p className="text-sm text-muted-foreground">
            {resultado.total.toLocaleString('pt-BR')} ativos cadastrados
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportarCsvButton
            acao={exportarAtivosCSV}
            descricao="dos ativos filtrados"
          />
          <Button asChild variant="outline" className="gap-2">
            <Link href="/ativos/novo">
              <PackagePlus className="size-4" />
              Novo equipamento
            </Link>
          </Button>
        </div>
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
            saltoPagina
            tamanhos={TAMANHOS_PAGINA}
          />
        </>
      )}
    </div>
  )
}
