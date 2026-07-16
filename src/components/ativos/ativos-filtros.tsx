'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  CATEGORIA_ORDEM,
  STATUS_ORDEM,
  rotuloCategoria,
  rotuloStatus,
} from '@/lib/dominio'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import { cn } from '@/lib/utils'
import type { Filial } from '@/lib/queries/filiais'

const TODAS = '__todas'

export function AtivosFiltros({ filiais }: { filiais: Filial[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Acende a barra global enquanto a navegação por filtro está pendente (roda
  // em startTransition, então NÃO dispara o loading.tsx da rota).
  useReportarNavegacao(isPending)

  const qAtual = params.get('q') ?? ''
  const filialAtual = params.get('filial') ?? ''
  const categoriaAtual = params.get('categoria') ?? ''
  const statusAtual = (params.get('status') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const [busca, setBusca] = useState(qAtual)

  // Sincroniza o input quando o param `q` muda por fora (Limpar, voltar/avançar
  // do navegador). Padrao oficial do React "You Might Not Need an Effect":
  // guarda o valor anterior em ESTADO e ajusta durante o render (converge).
  const [qSync, setQSync] = useState(qAtual)
  if (qSync !== qAtual) {
    setQSync(qAtual)
    setBusca(qAtual)
  }

  // Aplica uma alteracao de filtro: reseta a pagina e navega preservando o resto.
  function aplicar(mudancas: Record<string, string | null>) {
    const novo = new URLSearchParams(params.toString())
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    novo.delete('page') // qualquer mudanca de filtro volta p/ a pagina 1
    startTransition(() => {
      router.push(`${pathname}?${novo.toString()}`)
    })
  }

  // Debounce da busca livre (300ms). Lê a URL FRESCA em window.location no
  // disparo (não o `params` capturado no render) — senão um filtro alterado por
  // outro controle nesses 300ms seria descartado ao aplicar a busca.
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

  function toggleStatus(valor: string, marcado: boolean) {
    const set = new Set(statusAtual)
    if (marcado) set.add(valor)
    else set.delete(valor)
    aplicar({ status: [...set].join(',') || null })
  }

  const temFiltro =
    !!qAtual || !!filialAtual || !!categoriaAtual || statusAtual.length > 0

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-center gap-2 transition-opacity',
        isPending && 'opacity-70',
      )}
    >
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar patrimônio, colaborador ou modelo…"
          className="pl-8"
          aria-label="Buscar ativos"
        />
      </div>

      <Select
        value={filialAtual || TODAS}
        onValueChange={(v) => aplicar({ filial: v === TODAS ? null : v })}
      >
        <SelectTrigger className="w-[160px]" aria-label="Filtrar por filial">
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
        value={categoriaAtual || TODAS}
        onValueChange={(v) => aplicar({ categoria: v === TODAS ? null : v })}
      >
        <SelectTrigger className="w-[150px]" aria-label="Filtrar por categoria">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas categorias</SelectItem>
          {CATEGORIA_ORDEM.map((c) => (
            <SelectItem key={c} value={c}>
              {rotuloCategoria(c)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <SlidersHorizontal className="size-4" />
            Status
            {statusAtual.length > 0 && (
              <Badge className="ml-1 h-5 min-w-5 justify-center px-1 tabular-nums">
                {statusAtual.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <p className="mb-2 text-sm font-medium">Filtrar por status</p>
          <div className="grid gap-2">
            {STATUS_ORDEM.map((s) => {
              const id = `status-${s}`
              return (
                <div key={s} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={statusAtual.includes(s)}
                    onCheckedChange={(c) => toggleStatus(s, c === true)}
                  />
                  <Label htmlFor={id} className="font-normal">
                    {rotuloStatus(s)}
                  </Label>
                </div>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

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
