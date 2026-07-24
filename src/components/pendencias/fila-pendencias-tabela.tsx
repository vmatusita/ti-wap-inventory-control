'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PenLine, PackageCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmarAssinaturaDialog } from '@/components/ativos/confirmar-assinatura-dialog'
import { ResolverPendenciaItemDialog } from '@/components/pendencias/resolver-pendencia-item-dialog'
import { rotuloCategoria, rotuloAcessorio } from '@/lib/dominio'
import { ROTULO_TIPO_PENDENCIA, CLASSE_TIPO_PENDENCIA } from '@/lib/pendencias/rotulos'
import type { PendenciaDetalhe } from '@/lib/queries/pendencias-detalhe'

// Uma linha da fila com o "desde" JÁ formatado no servidor (o Server Component
// calcula formatDate + "há N dias"): evita `new Date()` no cliente e o mismatch de
// hidratação na virada do dia.
export type LinhaFila = PendenciaDetalhe & { desdeFmt: string; desdeRel: string }

// A fila /pendencias (F18): tabela única com todos os tipos, MAIS a seleção e a
// resolução (individual e em LOTE) das pendências de item. Server Component seria
// suficiente para o resto, mas a seleção múltipla precisa de estado → Client. Os
// demais tipos seguem com sua ação (termo → confirmar assinatura); só os itens
// ganham checkbox + Resolver.
export function FilaPendenciasTabela({ rows }: { rows: LinhaFila[] }) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())

  // Ids de item VISÍVEIS nesta página (a seleção some ao paginar/filtrar — cada
  // página resolve o seu; simples e sem surpresa de "resolvi o que não via").
  const idsItens = useMemo(
    () =>
      rows
        .filter((r) => r.tipo === 'itens' && r.pendenciaItemId)
        .map((r) => r.pendenciaItemId as string),
    [rows],
  )
  const selecionadasVisiveis = useMemo(
    () => idsItens.filter((id) => selecionadas.has(id)),
    [idsItens, selecionadas],
  )
  const todosMarcados =
    idsItens.length > 0 && selecionadasVisiveis.length === idsItens.length

  function toggle(id: string, on: boolean) {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }
  function toggleTodos(on: boolean) {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      for (const id of idsItens) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const nSel = selecionadasVisiveis.length

  return (
    <div>
      {/* Barra de lote — aparece quando há item selecionado. Resolve todos com UMA
          justificativa (o caminho para zerar a fila herdada). */}
      {nSel > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">
            {nSel} {nSel === 1 ? 'item selecionado' : 'itens selecionados'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setSelecionadas(new Set())}
            >
              <X className="size-3.5" />
              Limpar
            </Button>
            <ResolverPendenciaItemDialog
              ids={selecionadasVisiveis}
              resumo={`${nSel} ${nSel === 1 ? 'item selecionado' : 'itens selecionados'}`}
              trigger={
                <Button size="sm" className="h-8 gap-1.5">
                  <PackageCheck className="size-3.5" />
                  Resolver selecionados
                </Button>
              }
            />
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              {idsItens.length > 0 && (
                <Checkbox
                  checked={todosMarcados}
                  onCheckedChange={(c) => toggleTodos(c === true)}
                  aria-label="Selecionar todos os itens faltantes desta página"
                />
              )}
            </TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Patrimônio</TableHead>
            <TableHead>Modelo</TableHead>
            <TableHead>Colaborador</TableHead>
            <TableHead>Setor</TableHead>
            <TableHead>Filial</TableHead>
            <TableHead className="text-right">Desde</TableHead>
            <TableHead className="text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const ehItem = p.tipo === 'itens' && !!p.pendenciaItemId
            const itemId = p.pendenciaItemId as string
            return (
              <TableRow key={p.ordem}>
                <TableCell>
                  {ehItem && (
                    <Checkbox
                      checked={selecionadas.has(itemId)}
                      onCheckedChange={(c) => toggle(itemId, c === true)}
                      aria-label={`Selecionar ${rotuloAcessorio(p.item ?? 'item')}`}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`border-transparent ${CLASSE_TIPO_PENDENCIA[p.tipo]}`}>
                    {ROTULO_TIPO_PENDENCIA[p.tipo]}
                  </Badge>
                  {ehItem && p.item && (
                    <span className="mt-1 block text-xs font-medium">
                      {rotuloAcessorio(p.item)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  <Link
                    href={`/ativos/${p.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {p.patrimonio ?? '—'}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {[p.marca, p.modelo].filter(Boolean).join(' ') ||
                    (p.categoria ? rotuloCategoria(p.categoria) : '—')}
                </TableCell>
                <TableCell>{p.colaborador ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{p.setor ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.filialNome ?? p.filialSlug ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span>{p.desdeFmt}</span>
                  <span className="block text-xs text-muted-foreground">{p.desdeRel}</span>
                </TableCell>
                <TableCell className="text-right">
                  {p.tipo === 'termo' && (
                    <ConfirmarAssinaturaDialog
                      ativoId={p.id}
                      trigger={
                        <Button variant="outline" size="sm" className="h-8 gap-1.5">
                          <PenLine className="size-3.5" />
                          Confirmar assinatura
                        </Button>
                      }
                    />
                  )}
                  {ehItem && (
                    <ResolverPendenciaItemDialog
                      ids={[itemId]}
                      resumo={`${rotuloAcessorio(p.item ?? 'item')}${
                        p.patrimonio ? ' · ' + p.patrimonio : ''
                      }`}
                      trigger={
                        <Button variant="outline" size="sm" className="h-8 gap-1.5">
                          <PackageCheck className="size-3.5" />
                          Resolver
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
