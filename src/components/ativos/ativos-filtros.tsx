'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal, Tag, X } from 'lucide-react'
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
  const semPatrimonioAtual = params.get('semPatrimonio') === '1'
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

  // A busca livre só é aplicada ao SUBMETER (Enter no campo ou botão "Pesquisar") —
  // nunca a cada tecla. Buscar durante a digitação fazia a navegação resincronizar
  // o campo com a URL e "voltar" o texto para o estado anterior. Lê a URL FRESCA em
  // window.location (não o `params` do render) p/ preservar outros filtros trocados.
  function submeterBusca() {
    const novo = new URLSearchParams(window.location.search)
    const termo = busca.trim()
    if (termo) novo.set('q', termo)
    else novo.delete('q')
    novo.delete('page') // nova busca volta p/ a página 1
    startTransition(() => router.push(`${pathname}?${novo.toString()}`))
  }

  function toggleStatus(valor: string, marcado: boolean) {
    const set = new Set(statusAtual)
    if (marcado) set.add(valor)
    else set.delete(valor)
    aplicar({ status: [...set].join(',') || null })
  }

  // "Limpar" apaga FILTROS, não a forma de ver a lista: ordenação (`ord`) e
  // tamanho de página (`pp`) sobrevivem — quem ordenou por patrimônio e limpou
  // a busca não espera a lista voltar sozinha para "atualizado em" (F11/T7).
  function limpar() {
    const antigo = new URLSearchParams(params.toString())
    const novo = new URLSearchParams()
    for (const chave of ['ord', 'pp']) {
      const valor = antigo.get(chave)
      if (valor) novo.set(chave, valor)
    }
    setBusca('')
    const qs = novo.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  const temFiltro =
    !!qAtual ||
    !!filialAtual ||
    !!categoriaAtual ||
    statusAtual.length > 0 ||
    semPatrimonioAtual

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-center gap-2 transition-opacity',
        isPending && 'opacity-70',
      )}
    >
      {/* `basis-full xl:basis-0` dá à busca uma LINHA PRÓPRIA no flex-wrap até
          1279px. Com `flex-1` (= flex:1 1 0%) o basis 0 não reservava espaço: a
          busca era empacotada junto dos selects de largura fixa, o espaço livre
          ficava negativo e o campo colapsava para 44px — desenhado POR CIMA do
          vizinho (F13/B4-R1). `grow` no lugar de `flex-1` porque o atalho
          reescreveria o basis: no CSS do Tailwind o shorthand `flex` vem DEPOIS
          de `basis-*`, então `basis-full flex-1` seria um no-op (medido). */}
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
            placeholder="Buscar patrimônio, colaborador, marca ou modelo…"
            className="pl-8"
            aria-label="Buscar ativos"
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

      <Button
        variant={semPatrimonioAtual ? 'default' : 'outline'}
        onClick={() =>
          aplicar({ semPatrimonio: semPatrimonioAtual ? null : '1' })
        }
        aria-pressed={semPatrimonioAtual}
        className="gap-2"
      >
        <Tag className="size-4" />
        Sem patrimônio
      </Button>

      {temFiltro && (
        <Button
          variant="ghost"
          onClick={limpar}
          className="gap-1 text-muted-foreground"
        >
          <X className="size-4" />
          Limpar
        </Button>
      )}
    </div>
  )
}
