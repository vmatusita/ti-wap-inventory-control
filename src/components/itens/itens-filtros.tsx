'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
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
import {
  baseDosFiltros,
  registrarFiltrosEnviados,
  useEsquecerFiltrosAoSair,
} from '@/components/filtros/url'
import { FiltroFilial, opcoesDeFiliais } from '@/components/layout/filtro-filial'

const TODOS = '__todos'

// Filtros de `/itens` — UM conjunto só, na gramática de `AtivosFiltros` (F42).
//
// O QUE SAIU DAQUI, e por quê: o alternador segmentado **Consolidado × Por
// filial** (`?visao=`, F11 · I4). Ele era a única coisa no produto inteiro que
// fazia um filtro TROCAR AS COLUNAS da tabela em vez de recortar as linhas — a
// dor D3 do `docs/PLANO-ITENS.md`, dita pelo Johnny com todas as letras. A
// comparação entre filiais não sumiu: virou a LINHA EXPANSÍVEL de cada item
// (`itens-table.tsx`), atrás do mesmo chevron que os relatórios usam desde a F16.
//
// Efeito colateral bem-vindo: o filtro de filial passa a existir SEMPRE. Antes
// ele desaparecia na visão padrão, e um `?filial=N` colado na URL era neutralizado
// em silêncio no parse — comportamento que a própria F25 registrou como mudança
// de sentido de URL antiga.
//
// ⚠ `baseDosFiltros` (`src/components/filtros/url.ts`, F61) continua aqui. Ele existe porque `useSearchParams()` só
// reflete a URL COMMITADA, e duas trocas de filtro na mesma janela de navegação
// pendente liam o mesmo snapshot antigo — a segunda apagava a primeira. Isso vale
// DENTRO de um bloco (grupo, depois filial), não só entre os dois que existiam.
export function ItensFiltros({
  filiais,
  // F25 — seleção EFETIVA de filial, resolvida no servidor (pode vir do padrão do
  // cargo, e não da URL), por isso é prop e não `params.get('filial')`.
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
  useEsquecerFiltrosAoSair(pathname)

  const qAtual = params.get('q') ?? ''
  const grupoAtual = params.get('grupo') ?? ''

  const [busca, setBusca] = useState(qAtual)
  const [qSync, setQSync] = useState(qAtual)
  if (qSync !== qAtual) {
    setQSync(qAtual)
    setBusca(qAtual)
  }

  function empurrar(novo: URLSearchParams, commitada: string) {
    novo.delete('page') // qualquer mudança de filtro volta p/ a página 1
    const query = novo.toString()
    registrarFiltrosEnviados(pathname, commitada, query)
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  function aplicar(mudancas: Record<string, string | null>) {
    const commitada = params.toString()
    const novo = baseDosFiltros(pathname, commitada)
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    empurrar(novo, commitada)
  }

  // A busca só é aplicada ao SUBMETER (Enter ou botão "Pesquisar") — nunca a cada
  // tecla (buscar durante a digitação fazia o campo "voltar" ao estado anterior ao
  // resincronizar com a URL). Mesma régua de `AtivosFiltros`.
  function submeterBusca() {
    const commitada = params.toString()
    const novo = baseDosFiltros(pathname, commitada)
    const termo = busca.trim()
    if (termo) novo.set('q', termo)
    else novo.delete('q')
    empurrar(novo, commitada)
  }

  // "Limpar" apaga FILTROS, não a forma de ver a lista: o tamanho de página (`pp`)
  // sobrevive, exatamente como em `/ativos`. Apagar o `filial` devolve o operador
  // ao PADRÃO DO CARGO — que é o estado de repouso da tela, não um filtro escolhido.
  function limpar() {
    setBusca('')
    const commitada = params.toString()
    const base = baseDosFiltros(pathname, commitada)
    const novo = new URLSearchParams()
    const pp = base.get('pp')
    if (pp) novo.set('pp', pp)
    empurrar(novo, commitada)
  }

  // F25 — o `filial` conta como filtro quando a URL o traz (seleção explícita OU a
  // sentinela `todas`), e NÃO quando a marcação veio do padrão do cargo.
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
            className="h-10 pl-8 sm:h-8"
            aria-label="Buscar itens"
          />
        </div>
        <Button type="submit" variant="secondary" className="h-10 shrink-0 sm:h-8">
          Pesquisar
        </Button>
      </form>

      <FiltroFilial
        opcoes={opcoesDeFiliais(filiais, false)}
        selecionados={filiaisSelecionadas}
        aplicar={(v) => aplicar({ filial: v })}
        idPrefixo="itens-filial"
      />

      <Select
        value={grupoAtual || TODOS}
        onValueChange={(v) => aplicar({ grupo: v === TODOS ? null : v })}
      >
        {/* F42 — `w-[170px]` virou `w-44` (176px, da escala). Ver a nota longa em
            `ativos-filtros.tsx` sobre as 11 larguras em pixel herdadas. */}
        <SelectTrigger className="h-10 w-44 sm:h-8" aria-label="Filtrar por grupo">
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

      {temFiltro && (
        <Button
          variant="ghost"
          onClick={limpar}
          className="h-10 gap-1 text-muted-foreground sm:h-8"
        >
          <X className="size-4" />
          Limpar
        </Button>
      )}
    </div>
  )
}
