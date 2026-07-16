'use client'

import { useEffect, useState, useTransition } from 'react'
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

  function aplicar(mudancas: Record<string, string | null>) {
    const novo = new URLSearchParams(params.toString())
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    novo.delete('page')
    startTransition(() => router.push(`${pathname}?${novo.toString()}`))
  }

  useEffect(() => {
    if (busca === qAtual) return
    const t = setTimeout(() => {
      const novo = new URLSearchParams(window.location.search)
      if (busca) novo.set('q', busca)
      else novo.delete('q')
      novo.delete('page')
      startTransition(() => router.push(`${pathname}?${novo.toString()}`))
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const temFiltro = !!qAtual || !!filialAtual || !!grupoAtual

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar item…"
          className="pl-8"
          aria-label="Buscar itens"
        />
      </div>

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
