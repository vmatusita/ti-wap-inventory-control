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
import { CATEGORIA_ORDEM, pillTipo, rotuloCategoria, rotuloTipo } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { LinhaSaida } from '@/lib/relatorios/tipos'

const TODOS = '__todos'

// Saídas do período (§4.4 / §3.7.7): tipos saida + emprestimo. Contagem no
// título, resumo por (filial×)motivo, filtros internos (categoria, motivo, filial
// no consolidado). Colunas: Data · Filial · Categoria · Marca/Modelo · Patrimônio
// · Tipo · Motivo · Chamado · Colaborador/Setor · Termo · Obs.
export function TabelaSaidas({
  rows,
  ehGeral,
}: {
  rows: LinhaSaida[]
  ehGeral: boolean
}) {
  const [categoria, setCategoria] = useState('')
  const [motivo, setMotivo] = useState('')
  const [filial, setFilial] = useState('')

  const motivos = useMemo(
    () => [...new Set(rows.map((r) => r.motivo).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rows],
  )
  const filiais = useMemo(
    () => [...new Set(rows.map((r) => r.filial))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rows],
  )

  const filtradas = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!categoria || r.categoria === categoria) &&
          (!motivo || r.motivo === motivo) &&
          (!filial || r.filial === filial),
      ),
    [rows, categoria, motivo, filial],
  )
  const temFiltro = !!categoria || !!motivo || !!filial

  // Resumo por (filial×)motivo das linhas visíveis.
  const resumo = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of filtradas) {
      const chave = ehGeral
        ? `${r.filial} · ${r.motivo ?? 'Outro'}`
        : (r.motivo ?? 'Outro')
      map.set(chave, (map.get(chave) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [filtradas, ehGeral])

  return (
    <section id="saidas" className="scroll-mt-16 space-y-3 break-before-page">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Saídas — {rows.length.toLocaleString('pt-BR')} no período
        </h2>
        {temFiltro && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {filtradas.length.toLocaleString('pt-BR')} exibida(s)
          </span>
        )}
      </div>

      {resumo.length > 0 && (
        <div className="flex flex-wrap gap-1.5 print:hidden">
          {resumo.map(([chave, n]) => (
            <span key={chave} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
              {chave}: <span className="font-semibold tabular-nums">{n}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {ehGeral && (
          <Select value={filial || TODOS} onValueChange={(v) => setFilial(v === TODOS ? '' : v)}>
            <SelectTrigger size="sm" className="w-full sm:w-[150px]" aria-label="Filtrar por filial">
              <SelectValue placeholder="Filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as filiais</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
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
              <SelectItem key={c} value={c}>{rotuloCategoria(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={motivo || TODOS} onValueChange={(v) => setMotivo(v === TODOS ? '' : v)}>
          <SelectTrigger size="sm" className="w-full sm:w-[170px]" aria-label="Filtrar por motivo">
            <SelectValue placeholder="Motivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os motivos</SelectItem>
            {motivos.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {temFiltro && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={() => {
              setCategoria('')
              setMotivo('')
              setFilial('')
            }}
          >
            <X className="size-4" />
            Limpar
          </Button>
        )}
      </div>

      {filtradas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma saída no período.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                {ehGeral && <TableHead className="hidden md:table-cell">Filial</TableHead>}
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell">Marca/Modelo</TableHead>
                <TableHead>Patrimônio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="hidden md:table-cell">Chamado</TableHead>
                <TableHead className="hidden lg:table-cell">Colab./Setor</TableHead>
                <TableHead className="hidden xl:table-cell">Termo</TableHead>
                <TableHead className="hidden xl:table-cell">Obs.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDate(r.data)}
                  </TableCell>
                  {ehGeral && (
                    <TableCell className="hidden whitespace-nowrap md:table-cell">{r.filial}</TableCell>
                  )}
                  <TableCell className="hidden sm:table-cell">{rotuloCategoria(r.categoria)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">{r.modelo}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">{r.patrimonio}</TableCell>
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
                  <TableCell className="whitespace-nowrap">{r.motivo ?? '—'}</TableCell>
                  <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                    {r.chamado ? `#${r.chamado}` : '—'}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">
                    {r.colaboradorSetor ?? '—'}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap xl:table-cell">{r.termo ?? '—'}</TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="max-w-[200px]">
                      <ObsTooltip texto={r.obs} className="w-full text-xs" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
