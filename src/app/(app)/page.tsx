import Link from 'next/link'
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardCheck,
  Package,
  PackagePlus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getKpis, getUltimasMovimentacoes } from '@/lib/queries/relatorios'
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
// pula `descartado` (estoque.ts), e apontar para /ativos sem filtro faria a lista
// mostrar um número maior que o do tile clicado (achado da revisão adversarial).
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
  patrimonio: string | null
  categoria: CategoriaAtivo | null
  filial: string | null
  pendencia: string | null
}

export default async function DashboardPage() {
  const client = await createClient()
  const hoje = hojeISO()

  const [kpis, pendenciasRes, ultimas] = await Promise.all([
    getKpis(client, null),
    client
      .from('v_pendencias')
      .select('id, patrimonio, categoria, filial, pendencia')
      .limit(5),
    getUltimasMovimentacoes(client, null, { de: '2000-01-01', ate: hoje }, 5),
  ])
  const pendencias = (pendenciasRes.data ?? []) as PendenciaHome[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral do estoque de TI — todas as filiais.
        </p>
      </div>

      <KpiTiles kpis={kpis} links={LINKS_KPI} />

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
            {pendencias.length === 0 ? (
              <EstadoVazio
                variante="inline"
                icone={ClipboardCheck}
                titulo="Nenhuma pendência aberta. 🎉"
                descricao="nada a resolver por aqui"
              />
            ) : (
              <ul className="divide-y">
                {pendencias.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-3 py-2 text-sm">
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
