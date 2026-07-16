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
import { cn } from '@/lib/utils'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import type { Filial } from '@/lib/queries/filiais'
import type { TipoPendencia } from '@/lib/queries/pendencias-detalhe'

const TODAS = '__todas'

const TABS: { valor: TipoPendencia | 'todas'; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'termo', rotulo: 'Termos' },
  { valor: 'itens', rotulo: 'Itens faltantes' },
  { valor: 'triagem', rotulo: 'Triagem' },
  { valor: 'outras', rotulo: 'Outras' },
]

// Filtros da página /pendencias (F6A/A5): filial (por slug), tipo (tabs), busca
// por patrimônio/colaborador. Via searchParams (padrão server-side). Qualquer
// troca reseta a paginação. A filial usa o SLUG (v_pendencias.filial é o slug).
export function PendenciasFiltros({
  filiais,
  filialSlug,
  tipo,
  q,
}: {
  filiais: Filial[]
  filialSlug: string | null
  tipo: TipoPendencia | null
  q: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  useReportarNavegacao(isPending)

  const [busca, setBusca] = useState(q ?? '')
  const [qSync, setQSync] = useState(q ?? '')
  if (qSync !== (q ?? '')) {
    setQSync(q ?? '')
    setBusca(q ?? '')
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
    if (busca === (q ?? '')) return
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

  const temFiltro = !!q || !!filialSlug || !!tipo

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
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
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
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar patrimônio ou colaborador…"
            className="pl-8"
            aria-label="Buscar pendências"
          />
        </div>

        <Select
          value={filialSlug || TODAS}
          onValueChange={(v) => aplicar({ filial: v === TODAS ? null : v })}
        >
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por filial">
            <SelectValue placeholder="Filial" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as filiais</SelectItem>
            {filiais.map((f) => (
              <SelectItem key={f.id} value={f.slug}>
                {f.nome}
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
    </div>
  )
}
