'use client'

import { useRef, useState, useTransition } from 'react'
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
import { Card } from '@/components/ui/card'
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
  // Loading via useTransition (padrão único dos diálogos — OS-F11 T9): `enviando`
  // continua desabilitando os dois botões, então o duplo-submit segue impossível.
  const [enviando, start] = useTransition()
  const cancelarRef = useRef<HTMLButtonElement>(null)

  function confirmar() {
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador fica sem feedback. Como é ação destrutiva, a mensagem diz que
      // nada foi estornado — senão ele não sabe se deve tentar de novo.
      try {
        const res = await estornarMovimentacao({
          movimentacao_id: movimentacaoId,
          observacao: observacao.trim() || undefined,
        })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível estornar a movimentação.')
          return
        }
        toast.success('Movimentação estornada.')
        setAberto(false)
        setObservacao('')
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível estornar a movimentação — nada foi estornado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs sm:h-7">
          <Undo2 className="size-3.5" />
          Estornar
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-md"
        // Foco inicial no Cancelar: a ação destrutiva nunca fica sob o Enter
        // (mesmo padrão de "revogar senha" da F9).
        // `preventScroll`: este DialogContent é o próprio container de rolagem
        // (`max-h-[90svh] overflow-y-auto`) e o Cancelar fica no rodapé — sem
        // isso, em tela baixa (paisagem, zoom 200%) o diálogo abriria já rolado
        // até embaixo, escondendo o título e o resumo do que será desfeito.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus({ preventScroll: true })
        }}
      >
        <DialogHeader>
          <DialogTitle>Estornar última movimentação</DialogTitle>
          <DialogDescription>
            O estorno desfaz esta movimentação e devolve o ativo ao estado
            anterior. A movimentação original continua registrada na linha do
            tempo (riscada).
          </DialogDescription>
        </DialogHeader>

        {/* F40 — moldura à mão (`rounded-md border`) virou `Card`. `ring-0 border`
            mantém o traço no mesmo tom; a tinta não muda. */}
        <Card className="block overflow-visible border bg-muted/40 p-3 text-sm ring-0">
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
        </Card>

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
            ref={cancelarRef}
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
