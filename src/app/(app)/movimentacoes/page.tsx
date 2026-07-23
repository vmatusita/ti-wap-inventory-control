import Link from 'next/link'
import { Plus } from 'lucide-react'
import {
  interpretarBuscaMovimentacao,
  listarMovimentacoes,
  MOV_PAGE_SIZE,
} from '@/lib/queries/movimentacoes'
import { listarFiliais } from '@/lib/queries/filiais'
import { TIPO_META, type TipoMovimentacao } from '@/lib/dominio'
import { Button } from '@/components/ui/button'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { AtivosPaginacao } from '@/components/ativos/ativos-paginacao'
import { ListaFiltros } from '@/components/movimentacoes/lista-filtros'
import { ListaMovimentacoes } from '@/components/movimentacoes/lista-movimentacoes'

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  const s = typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined
  return s && s.trim() ? s.trim() : undefined
}

// `filial_id` é smallint (migration 0015): validar só o FORMATO deixaria passar
// `?filial=99999`, que o Postgres recusa (22003) e derruba o Server Component —
// a mesma classe de bug que a F9 corrigiu em /itens. Guarda idêntica à de
// /ativos e /itens.
const MAX_SMALLINT = 32767

function idNumerico(v: string | undefined): number | undefined {
  if (!v || !/^\d+$/.test(v)) return undefined
  const n = Number(v)
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_SMALLINT ? n : undefined
}

// Faixa sã de datas. O round-trip do `Date` NÃO basta: o JS tem ano 0 e aceita
// `0000-01-01`, mas o Postgres não (22008) — a query lançaria e derrubaria a
// página. Comparação de string funciona porque o formato é fixo `yyyy-MM-dd`.
const DATA_MIN = '1900-01-01'
const DATA_MAX = '2999-12-31'

// Data pura `yyyy-MM-dd`. Descarta data inexistente (2026-02-31, que o `Date`
// "rolaria" para março) e data fora da faixa sã — mesmo parser de /itens.
function dataISO(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  if (v < DATA_MIN || v > DATA_MAX) return undefined
  const d = new Date(`${v}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
    ? v
    : undefined
}

// Página: validar só o FORMATO deixaria passar `?page=99999999999999999999`, que
// vira 1e20 — o `from` do `range()` estoura o inteiro exato, o postgrest-js
// serializa `offset=3e+21` e o PostgREST DESCARTA o offset ilegível (200, sem
// PGRST103, então o fallback de "última página" não roda). A tela trava: rodapé
// com notação científica e "Anterior" que reenvia a MESMA URL. Sete dígitos
// cobrem qualquer acervo plausível e mantêm o caminho PGRST103 intacto.
const MAX_PAGE = 9_999_999

function paginaNumerica(v: string | undefined): number {
  if (!v || !/^\d+$/.test(v)) return 1
  const n = Number(v)
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1
}

// `hasOwnProperty` e não `in`: `?tipo=constructor` passaria pelo `in` (chave
// herdada do prototype) e viraria um cast inválido de enum no banco.
function tipoValido(v: string | undefined): TipoMovimentacao | undefined {
  return v && Object.prototype.hasOwnProperty.call(TIPO_META, v)
    ? (v as TipoMovimentacao)
    : undefined
}

// Lista de movimentações (F11 · M8). Até esta fase a sidebar "Movimentações"
// abria direto o formulário de registro e o único histórico era a linha do tempo
// POR ATIVO — não havia tela que respondesse "o que foi registrado hoje?".
// Filtros e paginação vivem na URL: o endereço é compartilhável e o back/forward
// do navegador refaz a consulta.
export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams

  // Param inválido é IGNORADO (nunca derruba a página nem vira filtro no banco).
  const q = texto(sp.q)
  const de = dataISO(texto(sp.de))
  const ate = dataISO(texto(sp.ate))
  const tipo = tipoValido(texto(sp.tipo))
  const filialId = idNumerico(texto(sp.filial))
  const page = paginaNumerica(texto(sp.page))

  const [filiais, resultado] = await Promise.all([
    listarFiliais(),
    listarMovimentacoes({
      q,
      de,
      ate,
      tipo,
      filialId,
      page,
      pageSize: MOV_PAGE_SIZE,
    }),
  ])

  const temFiltro = Boolean(q || de || ate || tipo || filialId)

  // A busca é de CAMPO ÚNICO (o PostgREST não faz `OR` entre tabela e embed):
  // dizer em qual campo procurou evita o operador achar que "não existe".
  const busca = interpretarBuscaMovimentacao(q)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Movimentações
            </h1>
            <LinkAjuda ancora="movimentacoes" rotulo="Ajuda sobre movimentações" />
          </div>
          <p className="text-sm text-muted-foreground">
            {resultado.total.toLocaleString('pt-BR')}{' '}
            {resultado.total === 1 ? 'movimentação' : 'movimentações'}
            {temFiltro ? ' no filtro atual' : ' registradas'}
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/movimentacoes/nova">
            <Plus className="size-4" aria-hidden />
            Nova movimentação
          </Link>
        </Button>
      </div>

      <ListaFiltros filiais={filiais} />

      {busca && (
        <p className="text-xs text-muted-foreground">
          {busca.campo === 'patrimonio' ? (
            <>
              Procurando pelo patrimônio{' '}
              <span className="font-medium tabular-nums text-foreground">
                {busca.valor}
              </span>
              .
            </>
          ) : (
            <>
              Procurando por colaborador que contenha{' '}
              <span className="font-medium text-foreground">
                “{busca.valor}”
              </span>
              . Para buscar por patrimônio, digite-o por inteiro (ex.: WAP0001234).
            </>
          )}
        </p>
      )}

      <ListaMovimentacoes rows={resultado.rows} temFiltro={temFiltro} />

      {resultado.total > resultado.pageSize && (
        <AtivosPaginacao
          page={resultado.page}
          pageSize={resultado.pageSize}
          total={resultado.total}
        />
      )}
    </div>
  )
}
