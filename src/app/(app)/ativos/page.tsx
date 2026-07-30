import { listarAtivos } from '@/lib/queries/ativos'
import { listarFiliais } from '@/lib/queries/filiais'
import { getOperador } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'
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
// Parsers de parâmetro de URL: FONTE ÚNICA em `@/lib/url-params` (F12 · W6A).
// `idNumerico` (smallint — sem ele `?filial=99999` derruba o Server Component com
// 22003) e `paginaNumerica` (teto de 7 dígitos — sem ele `?page=1e20` faz o offset
// do PostgREST sair em notação científica, ser descartado em silêncio e a
// paginação travar) viviam COPIADOS aqui. As cópias eram exatamente a família que
// produziu os achados F12-W4-01/-03/-04/-05: /itens, /movimentacoes, /pendencias e
// as actions de export já usam o módulo; /ativos era a última fora.
import { idNumerico, paginaNumerica } from '@/lib/url-params'
import Link from 'next/link'
import { Suspense } from 'react'
import { AtivosFiltros } from '@/components/ativos/ativos-filtros'
import { LembrarLista } from '@/components/ativos/lembrar-lista'
import { AtivosTable } from '@/components/ativos/ativos-table'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { Button } from '@/components/ui/button'
import { ExportarCsvButton } from '@/components/layout/exportar-csv-button'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { exportarAtivosCSV } from '@/lib/actions/exportar'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { PackageOpen, PackagePlus } from 'lucide-react'

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
  const filialId = idNumerico(texto(sp.filial)) ?? undefined

  const categoriaRaw = texto(sp.categoria)
  const categoria = CATEGORIA_ORDEM.includes(categoriaRaw as CategoriaAtivo)
    ? (categoriaRaw as CategoriaAtivo)
    : undefined

  const status = (texto(sp.status) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StatusAtivo => STATUS_ORDEM.includes(s as StatusAtivo))

  const page = paginaNumerica(texto(sp.page))

  const semPatrimonio = texto(sp.semPatrimonio) === '1'

  // F11/T7 — ordenação e tamanho de página vêm da URL. Param torto é IGNORADO
  // (cai no default `updated_at desc` / 50 por página), nunca derruba a tela.
  const ordenacao = parseOrdenacao(sp.ord)
  const pageSize = parseTamanhoPagina(sp.pp) ?? undefined

  // F19 — diferencia "não há ativo nenhum" de "nada nesta busca" no estado vazio
  // (mesma forma de /pendencias e /movimentacoes). `ord`, `pp` e `page` ficam de
  // fora: são apresentação, não recorte. `status` é ARRAY — `Boolean([])` é true.
  const temFiltro = Boolean(
    q || filialId || categoria || status.length > 0 || semPatrimonio,
  )

  // F21 — a lista é igual para os três cargos (leitura ampla); só o CTA de
  // cadastro depende do cargo. Exportar CSV continua para todos
  // (CONSULTA_EXPORTA_CSV = sim, §0 da ordem).
  const [operador, filiais, resultado] = await Promise.all([
    getOperador(),
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
  const escreve = podeEscrever(operador?.papel)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Ativos</h1>
            <LinkAjuda pagina="lista-de-ativos" rotulo="Ajuda sobre a lista de ativos" />
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
          {escreve && (
            <Button asChild variant="outline" className="gap-2">
              <Link href="/ativos/novo">
                <PackagePlus className="size-4" />
                Novo equipamento
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* F19 (P2-12a) — grava a URL filtrada desta lista para o "Voltar para
          ativos" da ficha voltar ao filtro. Não renderiza nada. */}
      <Suspense fallback={null}>
        <LembrarLista />
      </Suspense>

      <AtivosFiltros filiais={filiais} />

      {resultado.rows.length === 0 ? (
        // F19 — `resultado.total === 0` além do `!temFiltro` porque `?page=9` sem
        // filtro traz zero linhas com base cheia e cairia no texto errado.
        !temFiltro && resultado.total === 0 ? (
          <EstadoVazio
            titulo="Nenhum ativo cadastrado ainda"
            descricao={
              escreve
                ? 'Cadastre o primeiro equipamento para começar a controlar o estoque.'
                : 'Nada cadastrado ainda — quem registra as compras é o cargo Operador.'
            }
            acao={escreve ? { href: '/ativos/novo', rotulo: 'Cadastrar o primeiro' } : undefined}
          />
        ) : (
          <EstadoVazio
            icone={PackageOpen}
            titulo="Nenhum ativo com esses filtros"
            descricao="Ajuste a busca ou limpe os filtros para ver todos os ativos."
            acao={{ href: '/ativos', rotulo: 'Limpar filtros' }}
          />
        )
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
