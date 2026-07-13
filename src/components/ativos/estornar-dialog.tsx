'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ativos/status-badge'
import { estornarMovimentacao } from '@/lib/actions/movimentacoes'
import { ouTraco } from '@/lib/format'
import type { StatusAtivo } from '@/lib/dominio'

export function EstornarDialog({
  movimentacaoId,
  restauraStatus,
  restauraColaborador,
  restauraSetor,
  filialAnteriorNome,
}: {
  movimentacaoId: string
  restauraStatus: StatusAtivo | null
  restauraColaborador: string | null
  restauraSetor: string | null
  filialAnteriorNome: string | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function confirmar() {
    setEnviando(true)
    const res = await estornarMovimentacao({
      movimentacao_id: movimentacaoId,
      observacao: observacao.trim() || undefined,
    })
    setEnviando(false)
    if (!res.ok) {
      toast.error(res.erro ?? 'Não foi possível estornar a movimentação.')
      return
    }
    toast.success('Movimentação estornada.')
    setAberto(false)
    setObservacao('')
    router.refresh()
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs sm:h-7">
          <Undo2 className="size-3.5" />
          Estornar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Estornar última movimentação</DialogTitle>
          <DialogDescription>
            O estorno desfaz esta movimentação e devolve o ativo ao estado
            anterior. A movimentação original continua registrada na linha do
            tempo (riscada).
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="mb-2 font-medium">O ativo volta a ser:</p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              {restauraStatus ? (
                <StatusBadge status={restauraStatus} />
              ) : (
                <span>—</span>
              )}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-muted-foreground">Colaborador:</span>
              <span>{ouTraco(restauraColaborador)}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-muted-foreground">Setor:</span>
              <span>{ouTraco(restauraSetor)}</span>
            </li>
            {filialAnteriorNome && (
              <li className="flex items-center gap-2">
                <span className="text-muted-foreground">Filial:</span>
                <span>{filialAnteriorNome}</span>
              </li>
            )}
          </ul>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="estorno-obs">Observação (opcional)</Label>
          <Textarea
            id="estorno-obs"
            rows={2}
            maxLength={500}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Motivo do estorno…"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAberto(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Estornando…' : 'Confirmar estorno'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
