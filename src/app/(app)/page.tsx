import Link from 'next/link'
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardCheck,
  Package,
  PackageMinus,
  PackagePlus,
  TriangleAlert,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getKpis, getUltimasMovimentacoes } from '@/lib/queries/relatorios'
import { getSaldosItens, listarItensAtivos } from '@/lib/queries/itens'
import { itensParaRepor, minimosDoCatalogo } from '@/lib/itens/repor'
import { hojeISO, formatDate } from '@/lib/format'
import { rotuloCategoria, pillTipo, rotuloTipo } from '@/lib/dominio'
import type { CategoriaAtivo } from '@/lib/dominio'
import { Card, CardContent } from '@/components/ui/card'
import { KpiTiles, type LinksKpi } from '@/components/relatorios/kpi-tiles'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { cn } from '@/lib/utils'

const ACOES = [
  {
    href: '/movimentacoes/nova',
    icone: ArrowLeftRight,
    titulo: 'Nova movimentação',
    descricao: 'Saída, devolução, transferência… inclusive em lote.',
  },
  {
    href: '/ativos/novo',
    icone: PackagePlus,
    titulo: 'Novo equipamento',
    descricao: 'Entrada por compra — um ou vários de uma vez.',
  },
  {
    href: '/relatorios/geral',
    icone: BarChart3,
    titulo: 'Relatórios',
    descricao: 'Estoque por filial, ao vivo, e o arquivo semanal.',
  },
  {
    href: '/ativos',
    icone: Package,
    titulo: 'Ativos',
    descricao: 'Consultar, filtrar e abrir a ficha de um ativo.',
  },
]

// Destino de cada KPI (OS-F9 / T2) — só no dashboard. Os valores são os do enum
// `status_ativo` (STATUS_ORDEM em dominio.ts), que é o que /ativos aceita em
// `status` (CSV). "Total de ativos" lista os 7 status que o KPI soma — `kpisDeEstado`
// pula as baixas `descartado` e `devolvido_fornecedor` (estoque.ts), e apontar para
// /ativos sem filtro faria a lista mostrar um número maior que o do tile clicado
// (achado da revisão adversarial). O estado terminal novo (F14) fica FORA por isso.
const LINKS_KPI: LinksKpi = {
  total:
    '/ativos?status=em_estoque,reservado,em_uso,emprestado,em_triagem,em_manutencao,defasado',
  em_uso: '/ativos?status=em_uso',
  em_estoque: '/ativos?status=em_estoque',
  reservado: '/ativos?status=reservado',
  em_triagem: '/ativos?status=em_triagem',
  em_manutencao: '/ativos?status=em_manutencao',
  defasado: '/ativos?status=defasado',
}

type PendenciaHome = {
  id: string | null
  ordem: string | null
  patrimonio: string | null
  categoria: CategoriaAtivo | null
  filial: string | null
  pendencia: string | null
}

export default async function DashboardPage() {
  const client = await createClient()
  const hoje = hojeISO()

  // As duas leituras do ponto de reposição (F12 · I5) entram no MESMO
  // `Promise.all` das outras — nada de cascata sequencial na home. `null` em
  // `getSaldosItens` é o consolidado de todas as filiais, que é justamente com
  // quem o mínimo compara (decisão do Johnny 22/07/2026).
  const [kpis, pendenciasRes, ultimas, saldosItens, catalogoItens] = await Promise.all([
    getKpis(client, null),
    // F18: a MESMA fonte do selo da sidebar e de /pendencias (v_fila_pendencias) —
    // inclui as pendências de item faltante (uma linha por item). Ler v_pendencias
    // aqui esconderia os itens (o backfill 0053 tirou o texto do campo livre) e a
    // prévia divergiria do selo. `ordem` é a chave única por linha (o mesmo ativo
    // pode ter mais de uma linha).
    client
      .from('v_fila_pendencias')
      .select('id, ordem, patrimonio, categoria, filial, pendencia')
      // As 5 mais ANTIGAS abertas (as que mais pedem ação), determinístico e na
      // MESMA ordem da fila (desde asc, desempate por `ordem`) — antes o limit(5)
      // sem order devolvia 5 arbitrários/instáveis (achado da revisão).
      .order('desde', { ascending: true, nullsFirst: false })
      .order('ordem', { ascending: true })
      .limit(5),
    getUltimasMovimentacoes(client, null, { de: '2000-01-01', ate: hoje }, 5),
    getSaldosItens(null),
    listarItensAtivos(),
  ])
  // A falha de leitura NÃO pode virar lista vazia: o estado vazio deste card é o
  // comemorativo ("Nenhuma pendência aberta 🎉"), então um erro em
  // `v_fila_pendencias` (RLS, view recriada, timeout) afirmaria ao operador
  // exatamente o contrário da verdade. Registra no servidor e a UI diz que não
  // conseguiu ler — o resto do dashboard continua de pé.
  const pendenciasErro = pendenciasRes.error
  if (pendenciasErro) {
    console.error('[dashboard] falha ao ler v_fila_pendencias:', pendenciasErro.message)
  }
  const pendencias = (pendenciasRes.data ?? []) as PendenciaHome[]

  // Item DESATIVADO que ainda tem saldo aparece na RPC e não no catálogo ativo:
  // fica sem mínimo no mapa e nunca alerta (repor.ts). O card só existe quando
  // há o que repor — ver o comentário na renderização.
  const repor = itensParaRepor(saldosItens, minimosDoCatalogo(catalogoItens))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral do estoque de TI — todas as filiais.
        </p>
      </div>

      <KpiTiles kpis={kpis} links={LINKS_KPI} />

      {/* Itens para repor (F12 · I5) — card INLINE, não tile do KpiTiles: os
          tiles contam ativos patrimoniados por status, e um nono tile contando
          outra coisa (itens por quantidade) leria como se fosse da mesma soma.
          Some por completo quando não há nada a repor: é um alerta de exceção,
          sem tela própria para onde levar, e um "0 itens para repor" permanente
          só somaria ruído a um dashboard que já tem 8 tiles, 2 cards e 4 atalhos
          — a ausência do card é a boa notícia. (Pendências, que é fixture com
          rota própria, continua mostrando o estado vazio comemorativo.) */}
      {repor.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-900">
          <CardContent className="py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <PackageMinus className="size-4 text-amber-700 dark:text-amber-400" aria-hidden />
                Itens para repor
                <span className="rounded bg-amber-100 px-1.5 text-xs tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {repor.length.toLocaleString('pt-BR')}
                </span>
              </h2>
              <Link
                href="/itens"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                ver em Itens
              </Link>
            </div>
            <ul className="divide-y">
              {repor.slice(0, 5).map((r) => (
                <li key={r.item_id} className="flex items-baseline gap-3 py-2 text-sm">
                  {/* O nome leva à busca JÁ FILTRADA em /itens (o mesmo param `q`
                      da caixa de busca da tela) — o operador chega no item, não
                      numa lista para procurar de novo. */}
                  <Link
                    href={`/itens?q=${encodeURIComponent(r.item)}`}
                    className="min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline"
                  >
                    {r.item}
                  </Link>
                  <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">
                    estoque {r.estoque.toLocaleString('pt-BR')} · mínimo{' '}
                    {r.minimo.toLocaleString('pt-BR')}
                  </span>
                  {/* "repor N", nunca "faltam N": "faltam" já é o vocabulário do
                      déficit de atrelados em /itens (spec §7) e reusar a palavra
                      aqui misturaria dois números que não se somam. */}
                  <span className="min-w-24 shrink-0 text-right tabular-nums text-amber-800 dark:text-amber-300">
                    repor {r.abaixo.toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
            {repor.length > 5 && (
              <p className="pt-2 text-xs text-muted-foreground">
                e mais {(repor.length - 5).toLocaleString('pt-BR')} item(ns) abaixo do
                mínimo.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="py-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Pendências</h2>
              <Link
                href="/pendencias"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                ver todas
              </Link>
            </div>
            {pendenciasErro ? (
              <EstadoVazio
                variante="inline"
                icone={TriangleAlert}
                titulo="Não foi possível ler as pendências."
                descricao="a lista pode estar desatualizada — abra Pendências para conferir"
              />
            ) : pendencias.length === 0 ? (
              <EstadoVazio
                variante="inline"
                icone={ClipboardCheck}
                titulo="Nenhuma pendência aberta. 🎉"
                descricao="nada a resolver por aqui"
              />
            ) : (
              <ul className="divide-y">
                {pendencias.map((p) => (
                  <li key={p.ordem ?? p.id} className="flex items-baseline gap-3 py-2 text-sm">
                    <Link
                      href={`/ativos/${p.id}`}
                      className="w-24 shrink-0 font-medium tabular-nums underline-offset-2 hover:underline"
                    >
                      {p.patrimonio ?? '—'}
                    </Link>
                    <span className="shrink-0 text-muted-foreground">
                      {p.categoria ? rotuloCategoria(p.categoria) : ''} · {p.filial}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-amber-800">
                      {p.pendencia}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Últimas movimentações</h2>
              <Link
                href="/relatorios/geral"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                ver todas
              </Link>
            </div>
            {ultimas.length === 0 ? (
              <EstadoVazio
                variante="inline"
                icone={ArrowLeftRight}
                titulo="Sem movimentações ainda."
                acao={{ href: '/movimentacoes/nova', rotulo: 'Registrar a primeira' }}
              />
            ) : (
              <ul className="divide-y">
                {ultimas.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                      {formatDate(m.data)}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        pillTipo(m.tipo),
                      )}
                    >
                      {rotuloTipo(m.tipo)}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {m.patrimonio}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {m.colaborador_setor ?? m.ativo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACOES.map((a) => (
          <Link key={a.href} href={a.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
              <CardContent className="flex items-start gap-3 py-5">
                <span className="rounded-md bg-muted p-2 text-foreground">
                  <a.icone className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{a.titulo}</p>
                  <p className="text-sm text-muted-foreground">{a.descricao}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
