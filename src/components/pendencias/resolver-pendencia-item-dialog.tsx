'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, PackageCheck } from 'lucide-react'
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
import { resolverPendenciaItem } from '@/lib/actions/pendencias'
import {
  DESFECHOS_PENDENCIA_ITEM,
  DESFECHO_PENDENCIA_ITEM_ROTULO,
  type DesfechoPendenciaItem,
} from '@/lib/dominio'

// Encerra 1..N pendências de item com desfecho (recuperado/baixa) + observação
// opcional (F18 §B2). Reusado na linha da fila (1 id), na barra de lote (N ids) e
// na ficha. Definitivo nesta fase (reabrir = backlog). Padrão de diálogo da F6B
// (useTransition + toast + router.refresh); o `enviando` desabilita os dois botões,
// então o duplo-submit segue impossível. Sem radio-group no design system → o
// desfecho é um par de botões segmentados (o selecionado fica `default`).
export function ResolverPendenciaItemDialog({
  ids,
  resumo,
  trigger,
}: {
  ids: string[]
  resumo: string // "Mochila · WAP0001234" (1) ou "3 itens selecionados" (lote)
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [desfecho, setDesfecho] = useState<DesfechoPendenciaItem | null>(null)
  const [obs, setObs] = useState('')
  const [enviando, start] = useTransition()

  const n = ids.length

  function resolver() {
    if (!desfecho) return
    start(async () => {
      const res = await resolverPendenciaItem({ ids, desfecho, observacao: obs })
      if (!res.ok) {
        toast.error(res.erro ?? 'Não foi possível resolver a pendência.')
        return
      }
      toast.success(n > 1 ? `${n} pendências resolvidas.` : 'Pendência resolvida.')
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o)
        if (o) {
          setDesfecho(null)
          setObs('')
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {n > 1 ? `Resolver ${n} pendências de item` : 'Resolver pendência de item'}
          </DialogTitle>
          <DialogDescription>
            {resumo}. Escolha o desfecho — a pendência sai da fila e fica registrada na
            ficha com quem resolveu e quando. É definitivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Desfecho</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DESFECHOS_PENDENCIA_ITEM.map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={desfecho === d ? 'default' : 'outline'}
                  className="justify-start gap-2"
                  onClick={() => setDesfecho(d)}
                  disabled={enviando}
                >
                  {desfecho === d && <Check className="size-4 shrink-0" />}
                  {DESFECHO_PENDENCIA_ITEM_ROTULO[d]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs-pendencia-item">Observação (opcional)</Label>
            <Textarea
              id="obs-pendencia-item"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              maxLength={500}
              placeholder="Ex.: devolveu na portaria; ou baixa por desligamento."
              disabled={enviando}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={resolver} disabled={enviando || !desfecho} className="gap-2">
            <PackageCheck className="size-4" />
            {enviando ? 'Resolvendo…' : 'Resolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
