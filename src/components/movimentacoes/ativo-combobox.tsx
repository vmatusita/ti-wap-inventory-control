'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { StatusBadge } from '@/components/ativos/status-badge'
import { buscarAtivosParaMovimentacao } from '@/lib/actions/movimentacoes'
import { rotuloCategoria } from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'

// Busca de ativo por patrimonio/modelo (OS-F2 3.5.1): server, debounce 300ms,
// min. 2 caracteres. Patrimonio duplicado exibe a service tag + aviso.
export function AtivoCombobox({
  onSelecionar,
  jaAdicionados,
  autoFocus = true,
}: {
  onSelecionar: (ativo: AtivoResumo) => void
  jaAdicionados: Set<string>
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<AtivoResumo[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    const q = query.trim()
    let ativo = true
    // Toda alteracao de estado acontece DENTRO do callback assincrono (nao no
    // corpo do efeito) — evita renders em cascata (react-hooks/set-state-in-effect).
    const t = setTimeout(async () => {
      if (q.length < 2) {
        if (ativo) {
          setResultados([])
          setCarregando(false)
        }
        return
      }
      if (ativo) setCarregando(true)
      try {
        const res = await buscarAtivosParaMovimentacao(q)
        if (ativo) setResultados(res)
      } finally {
        if (ativo) setCarregando(false)
      }
    }, q.length < 2 ? 0 : 300)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [query])

  const temDuplicado = resultados.some((r) => r.patrimonio_duplicado)
  const buscou = query.trim().length >= 2

  return (
    <div className="space-y-2">
      <Command shouldFilter={false} className="rounded-lg border">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          autoFocus={autoFocus}
          placeholder="Buscar patrimônio, marca ou modelo… (mín. 2 caracteres)"
        />
        <CommandList>
          {carregando && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Buscando…
            </div>
          )}
          {!carregando && buscou && resultados.length === 0 && (
            <CommandEmpty>Nenhum ativo encontrado.</CommandEmpty>
          )}
          {!carregando && !buscou && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Digite ao menos 2 caracteres para buscar.
            </div>
          )}
          {resultados.length > 0 && (
            <CommandGroup>
              {resultados.map((r) => {
                const jaTem = jaAdicionados.has(r.id)
                return (
                  <CommandItem
                    key={r.id}
                    value={r.id}
                    disabled={jaTem}
                    onSelect={() => {
                      if (jaTem) return
                      onSelecionar(r)
                      setQuery('')
                      setResultados([])
                    }}
                    className="flex items-center gap-2"
                  >
                    <span className="font-medium tabular-nums">
                      {r.patrimonio ?? 'sem patrimônio'}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {[rotuloCategoria(r.categoria), r.modelo]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {r.patrimonio_duplicado && (
                      <span className="rounded bg-amber-100 px-1.5 text-xs tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        ST {r.service_tag ?? '—'}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {r.filial_nome}
                      </span>
                      <StatusBadge status={r.status} className="text-[11px]" />
                      {jaTem && (
                        <span className="text-xs text-muted-foreground">
                          já no lote
                        </span>
                      )}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>

      {temDuplicado && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-3.5" />
          Patrimônio duplicado — confira a service tag antes de escolher.
        </p>
      )}
    </div>
  )
}
