'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, PackageCheck, Undo2 } from 'lucide-react'
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
import { reabrirPendenciaItem, resolverPendenciaItem } from '@/lib/actions/pendencias'
import { MIN_JUSTIFICATIVA_REABERTURA } from '@/lib/validators/pendencia-item'
import {
  DESFECHOS_PENDENCIA_ITEM,
  DESFECHO_PENDENCIA_ITEM_ROTULO,
  type DesfechoPendenciaItem,
} from '@/lib/dominio'

// Encerra 1..N pendências de item com desfecho (recuperado/baixa) + observação
// opcional (F18 §B2). Reusado na linha da fila (1 id), na barra de lote (N ids) e
// na ficha. F28/PND-05: "definitivo" deixou de ser absoluto — o nível
// administrador reabre (ver `ReabrirPendenciaItemDialog`, abaixo), com
// justificativa e rastro na linha do tempo; para o operador comum que resolveu,
// a decisão continua encerrada. Padrão de diálogo da F6B (useTransition + toast +
// router.refresh); o `enviando` desabilita os dois botões, então o duplo-submit
// segue impossível. Sem radio-group no design system → o desfecho é um par de
// botões segmentados (o selecionado fica `default`).
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
      // F19 — sem o catch, o throw de rede some dentro do startTransition: o
      // dialog fica aberto sem toast e o operador clica de novo. O erro de
      // negócio (`!res.ok`) segue tratado abaixo.
      try {
        const res = await resolverPendenciaItem({ ids, desfecho, observacao: obs })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível resolver a pendência.')
          return
        }
        toast.success(n > 1 ? `${n} pendências resolvidas.` : 'Pendência resolvida.')
        setAberto(false)
        router.refresh()
      } catch {
        // O lote é tudo-ou-nada no servidor: se a chamada nem chegou, nada mudou.
        toast.error(
          'Não foi possível resolver — nenhuma pendência foi resolvida. Verifique sua conexão e tente de novo.',
        )
      }
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
            ficha com quem resolveu e quando. Só o nível administrador consegue
            reabrir depois, com justificativa.
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

// F28/PND-05 — reabre UMA pendência de item já resolvida (desfecho errado: baixa
// no lugar de recuperado, ou um id a mais no lote). Restrita ao nível
// administrador — o botão só é renderizado quando `podeReabrir` (checado no
// chamador, `PendenciasItemFicha`); o cargo real é reconferido no servidor pela
// action (`exigirAdmin`), então esconder o botão aqui é só a mensagem, nunca a
// segurança. Molde: `DesfazerAssinaturaDialog`
// (components/ativos/confirmar-assinatura-dialog.tsx) — foco inicial no
// Cancelar (a ação nunca fica sob o Enter), `useTransition` + `toast` +
// `router.refresh()`. A justificativa é obrigatória (mínimo de
// `MIN_JUSTIFICATIVA_REABERTURA` caracteres, mesma régua das outras ações do
// projeto que pedem justificativa) — sem ela não há o que explicar depois, na
// linha do tempo, por que o desfecho anterior deixou de valer.
export function ReabrirPendenciaItemDialog({
  id,
  resumo,
}: {
  id: string
  resumo: string // "Mochila · WAP0001234"
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [enviando, start] = useTransition()
  const cancelarRef = useRef<HTMLButtonElement>(null)

  const justificativaOk = justificativa.trim().length >= MIN_JUSTIFICATIVA_REABERTURA
  const faltam = MIN_JUSTIFICATIVA_REABERTURA - justificativa.trim().length

  function reabrir() {
    if (!justificativaOk) return
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador fica sem feedback. Como a ação desfaz um registro, a
      // mensagem diz que nada mudou — senão ele não sabe se deve tentar de novo.
      try {
        const res = await reabrirPendenciaItem({ ids: [id], justificativa: justificativa.trim() })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível reabrir a pendência.')
          return
        }
        toast.success('Pendência reaberta.')
        setAberto(false)
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível reabrir a pendência — nada foi alterado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o)
        if (o) setJustificativa('')
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground">
          <Undo2 className="size-3.5" />
          Reabrir pendência
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-sm"
        // Foco inicial no Cancelar: a ação nunca fica sob o Enter (mesmo
        // padrão de `DesfazerAssinaturaDialog` e da Zona destrutiva).
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus({ preventScroll: true })
        }}
      >
        <DialogHeader>
          <DialogTitle>Reabrir pendência de item</DialogTitle>
          <DialogDescription>
            {resumo}. A pendência volta para a fila como aberta e o desfecho
            anterior é apagado — a reabertura fica registrada na linha do tempo
            do ativo, com o seu nome e a justificativa abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="justificativa-reabrir-pendencia">
            Justificativa <span className="text-muted-foreground">(obrigatória)</span>
          </Label>
          <Textarea
            id="justificativa-reabrir-pendencia"
            value={justificativa}
            rows={3}
            maxLength={500}
            placeholder="Ex.: marcado como baixa por engano — o item recuperado."
            onChange={(e) => setJustificativa(e.target.value)}
            disabled={enviando}
          />
          <p className="text-xs text-muted-foreground">
            {justificativaOk
              ? 'Fica na linha do tempo do ativo, junto com o seu nome e a data.'
              : `Faltam ${faltam} caractere(s) — é o que vai explicar a reabertura depois.`}
          </p>
        </div>

        <DialogFooter>
          <Button
            ref={cancelarRef}
            variant="ghost"
            onClick={() => setAberto(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={reabrir} disabled={!justificativaOk || enviando}>
            {enviando ? 'Reabrindo…' : 'Reabrir pendência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
