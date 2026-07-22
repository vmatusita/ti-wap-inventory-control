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
import { baseFiltrosItens, registrarFiltrosEnviados } from './url-filtros'

const TODAS = '__todas'
const TODOS = '__todos'

// Filtros da tela de itens (OS 3.3.1): filial, grupo, busca — via searchParams
// (padrão server-side da F3). Mudança de filtro reseta a página do histórico.
export function ItensFiltros({ filiais }: { filiais: Filial[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  useReportarNavegacao(isPending)

  const qAtual = params.get('q') ?? ''
  const filialAtual = params.get('filial') ?? ''
  const grupoAtual = params.get('grupo') ?? ''

  const [busca, setBusca] = useState(qAtual)
  const [qSync, setQSync] = useState(qAtual)
  if (qSync !== qAtual) {
    setQSync(qAtual)
    setBusca(qAtual)
  }

  // Empurra preservando o que já foi trocado nesta janela de navegação — inclusive
  // o que o bloco de filtros do histórico empurrou, já que os dois escrevem na
  // mesma URL. Ver `url-filtros.ts`.
  function empurrar(novo: URLSearchParams, commitada: string) {
    novo.delete('page')
    const query = novo.toString()
    registrarFiltrosEnviados(commitada, query)
    startTransition(() => router.push(`${pathname}?${query}`))
  }

  function aplicar(mudancas: Record<string, string | null>) {
    const commitada = params.toString()
    const novo = baseFiltrosItens(commitada)
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
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

  const temFiltro = !!qAtual || !!filialAtual || !!grupoAtual

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submeterBusca()
        }}
        className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md"
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

      <Select
        value={filialAtual || TODAS}
        onValueChange={(v) => aplicar({ filial: v === TODAS ? null : v })}
      >
        <SelectTrigger className="w-[170px]" aria-label="Filtrar por filial">
          <SelectValue placeholder="Filial" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as filiais</SelectItem>
          {filiais.map((f) => (
            <SelectItem key={f.id} value={String(f.id)}>
              {f.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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

      {temFiltro && (
        <Button
          variant="ghost"
          onClick={() => {
            setBusca('')
            startTransition(() => router.push(pathname))
          }}
          className="gap-1 text-muted-foreground"
        >
          <X className="size-4" />
          Limpar
        </Button>
      )}
    </div>
  )
}
