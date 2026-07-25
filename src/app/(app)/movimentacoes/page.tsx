import Link from 'next/link'
import { Plus } from 'lucide-react'
import {
  interpretarBuscaMovimentacao,
  listarMovimentacoes,
  MOV_PAGE_SIZE,
} from '@/lib/queries/movimentacoes'
import { listarFiliais } from '@/lib/queries/filiais'
import { dataISO, idNumerico, paginaNumerica } from '@/lib/url-params'
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

// `idNumerico`/`dataISO`/`paginaNumerica` moram em `@/lib/url-params` desde a
// F12 (W6A): eram três cópias divergentes (aqui, /itens e actions/exportar) e a
// divergência entre elas produziu quatro achados da auditoria da F12.
// `?param` inválido continua sendo IGNORADO; o módulo devolve `null` e aqui
// convertemos para `undefined`, que é o que `ListarMovimentacoesParams` espera.

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
  const de = dataISO(texto(sp.de)) ?? undefined
  const ate = dataISO(texto(sp.ate)) ?? undefined
  const tipo = tipoValido(texto(sp.tipo))
  const filialId = idNumerico(texto(sp.filial)) ?? undefined
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
            <LinkAjuda pagina="lista-de-movimentacoes" rotulo="Ajuda sobre a lista de movimentações" />
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
              {/* Patrimônio fora do padrão (F7J) é procurado EXATAMENTE como
                  está gravado: dizer isso evita o operador concluir que "não
                  existe" quando errou um caractere. */}
              {busca.canonico ? '.' : ' — exatamente como você digitou.'}
            </>
          ) : (
            <>
              Procurando por colaborador que contenha{' '}
              <span className="font-medium text-foreground">
                “{busca.valor}”
              </span>
              . Para buscar por patrimônio, digite-o por inteiro (ex.: WAP0001234
              ou a plaqueta fora do padrão, como está na ficha do ativo).
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
