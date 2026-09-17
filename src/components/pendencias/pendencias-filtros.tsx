'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import {
  baseDosFiltros,
  registrarFiltrosEnviados,
  useEsquecerFiltrosAoSair,
} from '@/components/filtros/url'
import { FiltroFilial, opcoesDeFiliais } from '@/components/layout/filtro-filial'
import type { Filial } from '@/lib/queries/filiais'
import type { TipoPendencia } from '@/lib/queries/pendencias-detalhe'

const TABS: { valor: TipoPendencia | 'todas'; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'termo', rotulo: 'Termos' },
  { valor: 'itens', rotulo: 'Itens faltantes' },
  { valor: 'triagem', rotulo: 'Triagem' },
  { valor: 'patrimonio', rotulo: 'Patrimônio' },
  // F24 — a única aba cuja fonte NÃO é `v_fila_pendencias`: ela troca a tabela pela mesa,
  // onde os cadastros do mesmo equipamento aparecem lado a lado.
  { valor: 'conflito', rotulo: 'Conflitos entre filiais' },
  { valor: 'outras', rotulo: 'Outras' },
]

// Filtros da página /pendencias (F6A/A5): filial (por slug), tipo (tabs), busca
// por patrimônio/colaborador. Via searchParams (padrão server-side). Qualquer
// troca reseta a paginação. A filial usa o SLUG (v_pendencias.filial é o slug).
export function PendenciasFiltros({
  filiais,
  // F25 — seleção EFETIVA de filial (SLUGS), resolvida no servidor: pode ter vindo
  // do padrão do cargo em vez da URL.
  filiaisSelecionadas,
  tipo,
  q,
}: {
  filiais: Filial[]
  filiaisSelecionadas: string[]
  tipo: TipoPendencia | null
  q: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  useReportarNavegacao(isPending)
  // F61 — a base da próxima URL sai de `src/components/filtros/url.ts` (ver lá o
  // defeito da troca que se perdia com a navegação pendente).
  useEsquecerFiltrosAoSair(pathname)

  const [busca, setBusca] = useState(q ?? '')
  const [qSync, setQSync] = useState(q ?? '')
  if (qSync !== (q ?? '')) {
    setQSync(q ?? '')
    setBusca(q ?? '')
  }

  function aplicar(mudancas: Record<string, string | null>) {
    const commitada = params.toString()
    const novo = baseDosFiltros(pathname, commitada)
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    novo.delete('page')
    registrarFiltrosEnviados(pathname, commitada, novo.toString())
    startTransition(() => router.push(`${pathname}?${novo.toString()}`))
  }

  // A busca só é aplicada ao SUBMETER (Enter ou botão "Pesquisar") — nunca a cada
  // tecla (buscar durante a digitação fazia o campo "voltar" ao estado anterior ao
  // resincronizar com a URL). A base é a de `baseDosFiltros`, que preserva os filtros
  // trocados junto mesmo com a navegação anterior ainda pendente.
  function submeterBusca() {
    const commitada = params.toString()
    const novo = baseDosFiltros(pathname, commitada)
    const termo = busca.trim()
    if (termo) novo.set('q', termo)
    else novo.delete('q')
    novo.delete('page')
    registrarFiltrosEnviados(pathname, commitada, novo.toString())
    startTransition(() => router.push(`${pathname}?${novo.toString()}`))
  }

  // F25 — só conta como filtro o `filial` que veio da URL; a marcação herdada do
  // padrão do cargo não deve manter o botão "Limpar" aceso para sempre.
  const temFiltro = !!q || !!params.get('filial') || !!tipo

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => {
          const ativo = (tipo ?? 'todas') === t.valor
          return (
            <button
              key={t.valor}
              type="button"
              onClick={() => aplicar({ tipo: t.valor === 'todas' ? null : t.valor })}
              className={cn(
                // F29/UXG-03 — o chip tinha ~26px; é o filtro mais tocado da fila e
                // vive lado a lado com irmãos, onde errar o alvo troca o filtro.
                'inline-flex min-h-10 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors sm:min-h-0',
                ativo
                  ? 'border-transparent bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {t.rotulo}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Linha própria para a busca até 1279px — ver ativos-filtros.tsx
            (F13/B4-R1: com `flex-1` o campo colapsava para 44px). */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submeterBusca()
          }}
          className="flex min-w-0 grow basis-full items-center gap-2 sm:max-w-md xl:basis-0"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar patrimônio ou colaborador…"
              className="h-10 pl-8 sm:h-8"
              aria-label="Buscar pendências"
            />
          </div>
          <Button type="submit" variant="secondary" className="h-10 shrink-0 sm:h-8">
            Pesquisar
          </Button>
        </form>

        {/* ⚠ Por SLUG (`porSlug`): `v_pendencias.filial` é o slug, não o id. */}
        <FiltroFilial
          opcoes={opcoesDeFiliais(filiais, true)}
          selecionados={filiaisSelecionadas}
          aplicar={(v) => aplicar({ filial: v })}
          idPrefixo="pend-filial"
        />

        {temFiltro && (
          <Button
            variant="ghost"
            onClick={() => {
              setBusca('')
              startTransition(() => router.push(pathname))
            }}
            className="h-10 gap-1 text-muted-foreground sm:h-8"
          >
            <X className="size-4" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  )
}
