'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Columns3, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GRUPO_ITEM_META, GRUPO_ITEM_ORDEM } from '@/lib/dominio'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import type { Filial } from '@/lib/queries/filiais'
import { baseFiltrosItens, registrarFiltrosEnviados } from './url-filtros'
import { FiltroFilial, opcoesDeFiliais } from '@/components/layout/filtro-filial'
import { ehVisaoConsolidado } from '@/lib/url-params'

const TODOS = '__todos'

// Filtros da tela de itens (OS 3.3.1): filial, grupo, busca — via searchParams
// (padrão server-side da F3). Mudança de filtro reseta a página do histórico.
// F11 · I4: acumula o alternador Consolidado × Por filial (param `visao`), que
// mora aqui porque é a mesma URL e o mesmo cuidado com navegação pendente.
export function ItensFiltros({
  filiais,
  // F25 — seleção EFETIVA de filial, resolvida no servidor (pode vir do padrão do
  // cargo). Vazia na visão por filial, onde não há recorte.
  filiaisSelecionadas,
}: {
  filiais: Filial[]
  filiaisSelecionadas: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  useReportarNavegacao(isPending)

  const qAtual = params.get('q') ?? ''
  const grupoAtual = params.get('grupo') ?? ''
  // F25 — o default INVERTEU: só `visao=consolidado` desliga a visão lado a lado.
  // A régua é a MESMA função do Server Component e do export (`ehVisaoConsolidado`
  // em url-params.ts) — antes este teste literal vivia copiado nos três lugares.
  const visaoFiliais = !ehVisaoConsolidado(params.get('visao'))

  const [busca, setBusca] = useState(qAtual)
  const [qSync, setQSync] = useState(qAtual)
  if (qSync !== qAtual) {
    setQSync(qAtual)
    setBusca(qAtual)
  }

  // Empurra preservando o que já foi trocado nesta janela de navegação — inclusive
  // o que o bloco de filtros do histórico empurrou, já que os dois escrevem na
  // mesma URL. Ver `url-filtros.ts`.
  function empurrar(novo: URLSearchParams, commitada: string, resetarPagina = true) {
    if (resetarPagina) novo.delete('page')
    const query = novo.toString()
    registrarFiltrosEnviados(commitada, query)
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  function aplicar(mudancas: Record<string, string | null>) {
    const commitada = params.toString()
    const novo = baseFiltrosItens(commitada)
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    // Na visão "Por filial" não existe recorte de filial. O select só some
    // quando a URL commita — durante a navegação pendente ele ainda está na
    // tela, e o clique nele gravaria `filial` numa URL que não tem como exibir
    // esse filtro. Quem decide é a base FRESCA (mesma disciplina de `trocarVisao`).
    if (!ehVisaoConsolidado(novo.get('visao'))) novo.delete('filial')
    empurrar(novo, commitada)
  }

  // A busca só é aplicada ao SUBMETER (Enter ou botão "Pesquisar") — nunca a cada
  // tecla (buscar durante a digitação fazia o campo "voltar" ao estado anterior ao
  // resincronizar com a URL).
  function submeterBusca() {
    const commitada = params.toString()
    const novo = baseFiltrosItens(commitada)
    const termo = busca.trim()
    if (termo) novo.set('q', termo)
    else novo.delete('q')
    empurrar(novo, commitada)
  }

  // Alternador de visão dos saldos. Trocar a visão NÃO mexe no conjunto do
  // histórico, então a página dele é preservada. Ao ir para "Por filial" o
  // param `filial` sai da URL: o select some nessa visão (é redundante ali) e um
  // filtro invisível continuaria recortando o histórico sem o operador ver.
  function trocarVisao(paraFiliais: boolean) {
    const commitada = params.toString()
    const novo = baseFiltrosItens(commitada)
    // A comparação é com a base FRESCA (não com `visaoFiliais`, que é a URL já
    // commitada): dois cliques na mesma janela de navegação pendente — ida e
    // volta — não podem se anular e deixar a tela na visão errada.
    const baseJaEstaPorFilial = !ehVisaoConsolidado(novo.get('visao'))
    if (baseJaEstaPorFilial === paraFiliais) return
    // F25 — os dois ramos INVERTERAM junto com o default: "Por filial" é agora a
    // ausência do param (URL limpa no padrão) e o Consolidado é a sentinela
    // explícita. Trocar o default sem trocar isto deixaria o botão "Consolidado"
    // apagando o param e voltando para "Por filial" — um botão sem efeito.
    if (paraFiliais) {
      novo.delete('visao')
      novo.delete('filial')
    } else {
      novo.set('visao', 'consolidado')
    }
    empurrar(novo, commitada, false)
  }

  // "Limpar" zera os filtros mas mantém a visão escolhida (trocar de visão é
  // navegação, não filtro). A visão sai da base FRESCA, não de `visaoFiliais`
  // (a URL já commitada): clicar "Por filial" e, com a navegação ainda pendente,
  // "Limpar" devolvia o operador ao Consolidado — desfazendo justamente a visão
  // que ele acabou de escolher.
  function limpar() {
    setBusca('')
    const commitada = params.toString()
    const base = baseFiltrosItens(commitada)
    const novo = new URLSearchParams()
    // Preserva a visão nas DUAS direções: agora quem precisa de param explícito é
    // o Consolidado, e sem isto "Limpar" no Consolidado devolveria o operador para
    // a visão por filial.
    if (ehVisaoConsolidado(base.get('visao'))) novo.set('visao', 'consolidado')
    empurrar(novo, commitada)
  }

  // F25 — o `filial` só conta como filtro quando veio da URL, nunca quando a
  // marcação herdou o padrão do cargo.
  const temFiltro = !!qAtual || !!params.get('filial') || !!grupoAtual

  return (
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
            placeholder="Buscar item…"
            className="pl-8"
            aria-label="Buscar itens"
          />
        </div>
        <Button type="submit" variant="secondary" className="shrink-0">
          Pesquisar
        </Button>
      </form>

      {/* Na visão "Por filial" TODAS as filiais estão na tabela — o select seria
          redundante (decisão do Johnny, F11 · I4). */}
      {!visaoFiliais && (
        <FiltroFilial
          opcoes={opcoesDeFiliais(filiais, false)}
          selecionados={filiaisSelecionadas}
          aplicar={(v) => aplicar({ filial: v })}
          idPrefixo="itens-filial"
        />
      )}

      <Select
        value={grupoAtual || TODOS}
        onValueChange={(v) => aplicar({ grupo: v === TODOS ? null : v })}
      >
        <SelectTrigger className="w-[170px]" aria-label="Filtrar por grupo">
          <SelectValue placeholder="Grupo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os grupos</SelectItem>
          {GRUPO_ITEM_ORDEM.map((g) => (
            <SelectItem key={g} value={g}>
              {GRUPO_ITEM_META[g].titulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div
        role="group"
        aria-label="Visão dos saldos"
        className="inline-flex items-center gap-0.5 rounded-md border p-0.5"
      >
        <Button
          type="button"
          variant={visaoFiliais ? 'ghost' : 'secondary'}
          size="sm"
          aria-pressed={!visaoFiliais}
          onClick={() => trocarVisao(false)}
          className="h-8"
        >
          Consolidado
        </Button>
        <Button
          type="button"
          variant={visaoFiliais ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={visaoFiliais}
          onClick={() => trocarVisao(true)}
          className="h-8 gap-1.5"
        >
          <Columns3 className="size-4" aria-hidden />
          Por filial
        </Button>
      </div>

      {temFiltro && (
        <Button variant="ghost" onClick={limpar} className="gap-1 text-muted-foreground">
          <X className="size-4" />
          Limpar
        </Button>
      )}
    </div>
  )
}
