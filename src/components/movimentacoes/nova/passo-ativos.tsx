'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ativos/status-badge'
import { AtivoCombobox } from '@/components/movimentacoes/ativo-combobox'
import { ColarListaDialog } from '@/components/movimentacoes/nova/colar-lista-dialog'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { rotuloCategoria, rotuloPatrimonio } from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'

// Set vazio ESTAVEL para o default da prop (ver colar-lista-dialog).
const VAZIO: ReadonlySet<string> = new Set()

// Passo 1 — monta o lote (busca + colar lista + lista de ativos). O `comandoRef`
// fica no combobox para o Enter-avanca (no mae) ignorar o Enter que seleciona
// resultado. O teto vem de MAX_LOTE_MOVIMENTACAO (F10/M11) — nenhum literal.
export function PassoAtivos({
  itens,
  naOutraMetade = VAZIO,
  jaAdicionados,
  comandoRef,
  onAdicionar,
  onAdicionarVarios,
  onRemover,
  onAvancar,
}: {
  itens: AtivoResumo[]
  // F26 — a metade OPOSTA do par troca/upgrade, quando a secao esta ativa. O
  // teto e do ENVIO inteiro, entao a contagem desta tela conta a soma; e os
  // ativos de la nao entram no lote principal (o form os recusa), entao a previa
  // do colar-lista tem de saber deles para nao prometer o que nao vai acontecer.
  naOutraMetade?: ReadonlySet<string>
  jaAdicionados: Set<string>
  comandoRef: React.RefObject<HTMLDivElement | null>
  onAdicionar: (ativo: AtivoResumo) => void
  onAdicionarVarios: (ativos: AtivoResumo[]) => void
  onRemover: (id: string) => void
  onAvancar: () => void
}) {
  const restante = MAX_LOTE_MOVIMENTACAO - itens.length - naOutraMetade.size
  const cheio = restante <= 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div ref={comandoRef} className="min-w-0 flex-1">
          <AtivoCombobox
            onSelecionar={onAdicionar}
            jaAdicionados={jaAdicionados}
            mostrarRecentes={!cheio}
          />
        </div>
        <ColarListaDialog
          lote={itens}
          naOutraMetade={naOutraMetade}
          onAdicionar={onAdicionarVarios}
        />
      </div>

      {cheio && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          O lote está no limite de {MAX_LOTE_MOVIMENTACAO} ativos
          {naOutraMetade.size > 0
            ? `, contando os ${naOutraMetade.size} da outra metade da troca`
            : ''}
          . Remova algum para trocar, ou registre este lote e comece outro.
        </p>
      )}

      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Nenhum ativo no lote ainda. Busque e adicione um ou mais ativos — ou
          cole a lista de patrimônios.
        </p>
      ) : (
        <ul className="space-y-2">
          {itens.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
            >
              <span className="font-medium tabular-nums">
                {rotuloPatrimonio(a.patrimonio)}
              </span>
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
                  aria-label={`Remover ${a.patrimonio ?? 'ativo sem patrimônio'}`}
                  className="-my-1 -mr-1 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {itens.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {itens.length + naOutraMetade.size} de {MAX_LOTE_MOVIMENTACAO} no lote
          </span>
        )}
        <Button onClick={onAvancar} disabled={itens.length === 0}>
          Avançar ({itens.length} {itens.length === 1 ? 'ativo' : 'ativos'})
        </Button>
      </div>
    </div>
  )
}
