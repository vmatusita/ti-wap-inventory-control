'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
// campo de busca livre (F16/T3, quando `setBusca`) + N `<Select>` (dirigidos por
// `campos`) + botão "Limpar". Puramente controlada — o estado/opções vêm do
// `useFiltrosTabela`. Sem campos E sem busca → não renderiza nada (ex.: a tabela de
// movimentações v1 sem `filtrosInternos`). `print:hidden` mantido.
export function FiltrosTabela({
  campos,
  filtros,
  opcoes,
  temFiltro,
  setFiltro,
  limpar,
  className,
  busca,
  setBusca,
}: {
  campos: CampoFiltro[]
  filtros: Record<CampoFiltro, string>
  opcoes: Record<CampoFiltro, Opcao[]>
  temFiltro: boolean
  setFiltro: (campo: CampoFiltro, valor: string) => void
  limpar: () => void
  className?: string
  // F16/T3 — busca livre. Presentes → renderiza o campo de busca; ausentes → barra
  // só com selects (tabelas antigas). Transferências/mov-itens usam SÓ a busca.
  busca?: string
  setBusca?: (valor: string) => void
}) {
  if (campos.length === 0 && !setBusca) return null

  const mostrarLimpar = temFiltro || (busca ?? '').trim() !== ''

  return (
    <div className={cn('flex flex-wrap items-center gap-2 print:hidden', className)}>
      {setBusca && (
        <div className="relative w-full sm:w-[220px]">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={busca ?? ''}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nesta tabela…"
            aria-label="Buscar nesta tabela"
            className="h-8 pl-7 text-sm"
          />
        </div>
      )}
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
      {mostrarLimpar && (
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={limpar}>
          <X className="size-4" />
          Limpar
        </Button>
      )}
    </div>
  )
}

// Chips do resumo por (filial×)motivo das linhas visíveis (entradas/saídas).
// `print:hidden` por padrão — nasceu como resumo de FILTRO (elemento de tela,
// não navega para o papel). A F32/RV-11 reusou o componente para a linha "quem
// mandou para quem?" do consolidado de transferências, que é CONTEÚDO do
// relatório (a ajuda promete essa linha na impressão) — daí a prop `imprimir`:
// só quem a passa `true` sai do `print:hidden`. Vazio → não renderiza.
export function ChipsResumo({
  resumo,
  imprimir = false,
}: {
  resumo: [string, number][]
  imprimir?: boolean
}) {
  if (resumo.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5', !imprimir && 'print:hidden')}>
      {resumo.map(([chave, n]) => (
        <span key={chave} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
          {chave}: <span className="font-semibold tabular-nums">{n}</span>
        </span>
      ))}
    </div>
  )
}
