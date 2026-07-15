'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ativos/status-badge'
import { AtivoCombobox } from '@/components/movimentacoes/ativo-combobox'
import { rotuloCategoria } from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'

// Passo 1 — monta o lote (busca + lista de ativos). O `comandoRef` fica no
// combobox para o Enter-avanca (no mae) ignorar o Enter que seleciona resultado.
export function PassoAtivos({
  itens,
  jaAdicionados,
  comandoRef,
  onAdicionar,
  onRemover,
  onAvancar,
}: {
  itens: AtivoResumo[]
  jaAdicionados: Set<string>
  comandoRef: React.RefObject<HTMLDivElement | null>
  onAdicionar: (ativo: AtivoResumo) => void
  onRemover: (id: string) => void
  onAvancar: () => void
}) {
  return (
    <div className="space-y-4">
      <div ref={comandoRef}>
        <AtivoCombobox onSelecionar={onAdicionar} jaAdicionados={jaAdicionados} />
      </div>

      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhum ativo no lote ainda. Busque e adicione um ou mais ativos.
        </p>
      ) : (
        <ul className="space-y-2">
          {itens.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
            >
              <span className="font-medium tabular-nums">{a.patrimonio}</span>
              {a.patrimonio_duplicado && (
                <span className="rounded bg-amber-100 px-1.5 text-xs tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  ST {a.service_tag ?? '—'}
                </span>
              )}
              <span className="truncate text-sm text-muted-foreground">
                {[rotuloCategoria(a.categoria), a.modelo]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {a.filial_nome}
                </span>
                <StatusBadge status={a.status} className="text-[11px]" />
                <button
                  type="button"
                  onClick={() => onRemover(a.id)}
                  aria-label={`Remover ${a.patrimonio}`}
                  className="-my-1 -mr-1 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button onClick={onAvancar} disabled={itens.length === 0}>
          Avançar ({itens.length} {itens.length === 1 ? 'ativo' : 'ativos'})
        </Button>
      </div>
    </div>
  )
}
