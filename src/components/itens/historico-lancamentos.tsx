'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { estornarLancamento } from '@/lib/actions/itens'
import { formatDate } from '@/lib/format'
import { pillTipoLancamento, rotuloTipoLancamento } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { LancamentoHistorico } from '@/lib/queries/itens'

// Histórico de lançamentos (OS 3.3.3): mais recente primeiro, com "Estornar"
// (cria o inverso vinculado — nada se apaga). Linha estornada/estorno sinalizadas.
export function HistoricoLancamentos({ rows }: { rows: LancamentoHistorico[] }) {
  const router = useRouter()
  const [alvo, setAlvo] = useState<LancamentoHistorico | null>(null)
  const [enviando, start] = useTransition()

  function confirmar() {
    if (!alvo) return
    start(async () => {
      const res = await estornarLancamento({ lancamento_id: alvo.id })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success('Lançamento estornado (inverso criado).')
      setAlvo(null)
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return (
      <EstadoVazio
        variante="inline"
        icone={ClipboardList}
        titulo="Nenhum lançamento no filtro atual"
        descricao="ajuste o item, o tipo ou o período acima"
        className="justify-center py-8"
      />
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="hidden md:table-cell">Filial</TableHead>
              <TableHead className="hidden md:table-cell">Chamado</TableHead>
              <TableHead className="hidden lg:table-cell">Obs.</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={cn(r.estornado && 'opacity-60')}>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatDate(r.data)}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      pillTipoLancamento(r.tipo),
                    )}
                  >
                    {rotuloTipoLancamento(r.tipo)}
                  </span>
                  {r.ehEstorno && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(estorno)</span>
                  )}
                  {r.estornado && !r.ehEstorno && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(estornado)</span>
                  )}
                </TableCell>
                <TableCell className="font-medium">{r.item}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {r.quantidade > 0 ? `+${r.quantidade}` : r.quantidade}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap md:table-cell">{r.filial}</TableCell>
                <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                  {r.chamado ? `#${r.chamado}` : '—'}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="max-w-[220px]">
                    <ObsTooltip texto={r.observacao} comIcone className="w-full text-xs" />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {!r.ehEstorno && !r.estornado && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => setAlvo(r)}
                    >
                      <Undo2 className="size-3.5" />
                      <span className="hidden sm:inline">Estornar</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Estornar lançamento</DialogTitle>
            <DialogDescription>
              Cria o lançamento <strong>inverso</strong> vinculado (nada é apagado). O estoque
              e os atrelados voltam ao estado anterior.
            </DialogDescription>
          </DialogHeader>
          {alvo && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{alvo.item}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    pillTipoLancamento(alvo.tipo),
                  )}
                >
                  {rotuloTipoLancamento(alvo.tipo)}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground tabular-nums">
                {alvo.quantidade > 0 ? `+${alvo.quantidade}` : alvo.quantidade} · {alvo.filial} ·{' '}
                {formatDate(alvo.data)}
                {alvo.chamado ? ` · #${alvo.chamado}` : ''}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlvo(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={enviando}>
              {enviando ? 'Estornando…' : 'Estornar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
