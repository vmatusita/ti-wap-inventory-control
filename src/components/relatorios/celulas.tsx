import { TableCell } from '@/components/ui/table'
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { formatDate } from '@/lib/format'
import { pillTipo, rotuloTipo, type TipoMovimentacao } from '@/lib/dominio'
import { cn } from '@/lib/utils'

// Células compartilhadas das tabelas de relatório (OS tech-debt 3.2). Antes cada
// tabela recopiava a célula de data, a pílula de tipo, o chamado (`#NNN`) e a
// observação com tooltip. Módulo sem `'use client'` de propósito: é renderável
// tanto pelas tabelas client (entradas/saídas/movimentações) quanto pela tabela
// server (transferências); `ObsTooltip` é o único trecho client, atrás da sua
// própria fronteira.

// Largura máxima PADRONIZADA da coluna de observação. Antes variava sem critério
// (160/200/220/240) — unificada em 220px (decisão registrada em DECISOES).
const OBS_MAX_W = 'max-w-[220px]'

// Cabeçalho das seções de tabela detalhada: "<titulo> — N no período" e, quando
// há filtro ativo, a contagem "M exibida(s)".
export function CabecalhoDetalhe({
  titulo,
  total,
  exibidas,
}: {
  titulo: string
  total: number
  exibidas?: number
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold tracking-tight">
        {titulo} — {total.toLocaleString('pt-BR')} no período
      </h2>
      {exibidas != null && (
        <span className="text-sm text-muted-foreground tabular-nums">
          {exibidas.toLocaleString('pt-BR')} exibida(s)
        </span>
      )}
    </div>
  )
}

// Coluna de data (dd/MM/yyyy, tabular, atenuada). Sempre a primeira coluna.
export function CelulaData({ data, className }: { data: string | null | undefined; className?: string }) {
  return (
    <TableCell className={cn('whitespace-nowrap tabular-nums text-muted-foreground', className)}>
      {formatDate(data)}
    </TableCell>
  )
}

// Pílula colorida do tipo de movimentação (a tabela a envolve num `<TableCell>`).
export function PilulaTipo({ tipo }: { tipo: TipoMovimentacao }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
        pillTipo(tipo),
      )}
    >
      {rotuloTipo(tipo)}
    </span>
  )
}

// Coluna de nº do chamado (`#NNN` ou travessão). A visibilidade responsiva
// (ex.: `hidden md:table-cell`) fica a cargo de quem chama, via `className`.
export function CelulaChamado({ chamado, className }: { chamado: string | null; className?: string }) {
  return (
    <TableCell className={cn('whitespace-nowrap tabular-nums text-muted-foreground', className)}>
      {chamado ? `#${chamado}` : '—'}
    </TableCell>
  )
}

// Coluna de observação truncada + tooltip. `comIcone` mostra o 💬 (movimentações).
export function CelulaObs({
  texto,
  comIcone,
  className,
}: {
  texto: string | null | undefined
  comIcone?: boolean
  className?: string
}) {
  return (
    <TableCell className={className}>
      <div className={OBS_MAX_W}>
        <ObsTooltip texto={texto} comIcone={comIcone} className="w-full text-xs" />
      </div>
    </TableCell>
  )
}
