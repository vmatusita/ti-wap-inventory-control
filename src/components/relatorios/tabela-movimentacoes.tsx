'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { formatDate } from '@/lib/format'
import {
  CATEGORIA_ORDEM,
  pillTipo,
  rotuloCategoria,
  rotuloTipo,
} from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { MovimentacaoRelatorio } from '@/lib/relatorios/tipos'

const TODOS = '__todos'

// Tabela "Últimas movimentações" — usada só na grade v1 (snapshots antigos que
// continuam abrindo). Filtros internos client-side. Sem export CSV (removido na
// v2 — decisão do plano §3.9): quem precisar de arquivo usa a impressão limpa.
export function TabelaMovimentacoes({
  rows,
  filtrosInternos = false,
  ehGeral = false,
}: {
  rows: MovimentacaoRelatorio[]
  filtrosInternos?: boolean
  ehGeral?: boolean
}) {
  const [filial, setFilial] = useState('')
  const [categoria, setCategoria] = useState('')
  const [tipo, setTipo] = useState('')

  const filiaisDisponiveis = useMemo(
    () => [...new Set(rows.map((r) => r.filial))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rows],
  )
  const tiposDisponiveis = useMemo(
    () => [...new Set(rows.map((r) => r.tipo))],
    [rows],
  )

  const filtradas = useMemo(() => {
    if (!filtrosInternos) return rows
    return rows.filter(
      (r) =>
        (!filial || r.filial === filial) &&
        (!categoria || r.categoria === categoria) &&
        (!tipo || r.tipo === tipo),
    )
  }, [rows, filtrosInternos, filial, categoria, tipo])

  const temFiltro = !!filial || !!categoria || !!tipo

  return (
    <div>
      {filtrosInternos && (
        <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
          {ehGeral && (
            <Select value={filial || TODOS} onValueChange={(v) => setFilial(v === TODOS ? '' : v)}>
              <SelectTrigger size="sm" className="w-full sm:w-[150px]" aria-label="Filtrar por filial">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as filiais</SelectItem>
                {filiaisDisponiveis.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={categoria || TODOS} onValueChange={(v) => setCategoria(v === TODOS ? '' : v)}>
            <SelectTrigger size="sm" className="w-full sm:w-[150px]" aria-label="Filtrar por categoria">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas categorias</SelectItem>
              {CATEGORIA_ORDEM.map((c) => (
                <SelectItem key={c} value={c}>
                  {rotuloCategoria(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tipo || TODOS} onValueChange={(v) => setTipo(v === TODOS ? '' : v)}>
            <SelectTrigger size="sm" className="w-full sm:w-[150px]" aria-label="Filtrar por tipo">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os tipos</SelectItem>
              {tiposDisponiveis.map((t) => (
                <SelectItem key={t} value={t}>
                  {rotuloTipo(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {temFiltro && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              onClick={() => {
                setFilial('')
                setCategoria('')
                setTipo('')
              }}
            >
              <X className="size-4" />
              Limpar
            </Button>
          )}
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma movimentação no período.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead className="hidden lg:table-cell">Ativo</TableHead>
                <TableHead>Colaborador / Setor</TableHead>
                <TableHead className="hidden md:table-cell">Filial</TableHead>
                <TableHead className="hidden md:table-cell">Chamado</TableHead>
                <TableHead className="hidden lg:table-cell">Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDate(r.data)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        pillTipo(r.tipo),
                      )}
                    >
                      {rotuloTipo(r.tipo)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    {r.patrimonio}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">{r.ativo}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.colaborador_setor ?? '—'}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap md:table-cell">{r.filial}</TableCell>
                  <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                    {r.chamado ? `#${r.chamado}` : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="max-w-[160px] sm:max-w-[240px]">
                      <ObsTooltip texto={r.observacao} comIcone className="w-full text-xs" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
