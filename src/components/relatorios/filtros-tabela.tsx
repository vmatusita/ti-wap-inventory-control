'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  CAMPO_FILTRO_META,
  TODOS,
  type CampoFiltro,
  type Opcao,
} from '@/components/relatorios/use-filtros-tabela'

// Barra de filtros compartilhada das tabelas de relatório (OS tech-debt 3.2):
// N `<Select>` (dirigidos por `campos`) + botão "Limpar". Puramente controlada —
// o estado/opções vêm do `useFiltrosTabela`. Sem campos → não renderiza nada
// (ex.: a tabela de movimentações sem `filtrosInternos`). `print:hidden` mantido.
export function FiltrosTabela({
  campos,
  filtros,
  opcoes,
  temFiltro,
  setFiltro,
  limpar,
  className,
}: {
  campos: CampoFiltro[]
  filtros: Record<CampoFiltro, string>
  opcoes: Record<CampoFiltro, Opcao[]>
  temFiltro: boolean
  setFiltro: (campo: CampoFiltro, valor: string) => void
  limpar: () => void
  className?: string
}) {
  if (campos.length === 0) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-2 print:hidden', className)}>
      {campos.map((campo) => {
        const meta = CAMPO_FILTRO_META[campo]
        return (
          <Select
            key={campo}
            value={filtros[campo] || TODOS}
            onValueChange={(v) => setFiltro(campo, v === TODOS ? '' : v)}
          >
            <SelectTrigger size="sm" className={cn('w-full', meta.largura)} aria-label={meta.ariaLabel}>
              <SelectValue placeholder={meta.placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>{meta.todos}</SelectItem>
              {(opcoes[campo] ?? []).map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      })}
      {temFiltro && (
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={limpar}>
          <X className="size-4" />
          Limpar
        </Button>
      )}
    </div>
  )
}

// Chips do resumo por (filial×)motivo das linhas visíveis (entradas/saídas).
// `print:hidden` — não vai para a impressão limpa. Vazio → não renderiza.
export function ChipsResumo({ resumo }: { resumo: [string, number][] }) {
  if (resumo.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 print:hidden">
      {resumo.map(([chave, n]) => (
        <span key={chave} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
          {chave}: <span className="font-semibold tabular-nums">{n}</span>
        </span>
      ))}
    </div>
  )
}
