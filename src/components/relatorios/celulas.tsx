import Link from 'next/link'
import { TableCell } from '@/components/ui/table'
import { Dica } from '@/components/ui/dica'
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { formatDate } from '@/lib/format'
import { pillTipo, rotuloTipo, type TipoMovimentacao } from '@/lib/dominio'
import { cn } from '@/lib/utils'

// Células compartilhadas das tabelas de relatório (OS tech-debt 3.2). Antes cada
// tabela recopiava a célula de data, a pílula de tipo, o chamado (`#NNN`) e a
// observação com tooltip. Módulo sem `'use client'` de propósito: é renderável
// tanto pelas tabelas client (entradas/saídas/movimentações) quanto pela tabela
// server (transferências); `ObsTooltip` é o único trecho client, atrás da sua
// própria fronteira. F19 — o mesmo vale para o `Dica` da badge "estornada".

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

// Badge discreta "estornada" (F16/T1). A cor de alerta (destructive) espelha o link
// "estornada" da linha do tempo da ficha. `title` traz a data no hover; o texto
// "estornada" é o sinal que sobrevive à IMPRESSÃO (sem `print:hidden`). Não é link.
// F19 — o `title` virou dica (P2-10): a data do estorno era invisível para quem
// navega por teclado. O texto impresso continua sendo o mesmo.
export function BadgeEstornada({ data }: { data?: string }) {
  return (
    <Dica
      texto={data ? `Estornada em ${formatDate(data)}` : 'Movimentação estornada'}
      className="inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive"
    >
      estornada
    </Dica>
  )
}

// Célula de patrimônio (F16/T1+T3). Para o OPERADOR com `ativoId`, o patrimônio vira
// link para a ficha (`/ativos/[id]`); viewer por senha e snapshots antigos (sem
// `ativoId`) ficam em texto puro. Acompanha a badge "estornada" quando a
// movimentação foi desfeita. Sempre a mesma tipografia (font-medium tabular-nums).
export function CelulaPatrimonio({
  patrimonio,
  ativoId,
  ehOperador,
  estornada,
  estornoData,
  className,
}: {
  patrimonio: string
  ativoId?: string
  ehOperador?: boolean
  estornada?: boolean
  estornoData?: string
  className?: string
}) {
  const linkavel = ehOperador && ativoId
  return (
    <TableCell className={cn('whitespace-nowrap font-medium tabular-nums', className)}>
      <span className="inline-flex items-center gap-1.5">
        {linkavel ? (
          <Link
            href={`/ativos/${ativoId}`}
            className="underline-offset-2 outline-none hover:underline focus-visible:underline"
          >
            {patrimonio}
          </Link>
        ) : (
          patrimonio
        )}
        {estornada && <BadgeEstornada data={estornoData} />}
      </span>
    </TableCell>
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
