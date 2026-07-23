'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  confirmarAssinaturaTermo,
  desfazerConfirmacaoTermo,
} from '@/lib/actions/termos'
import { hojeISO } from '@/lib/format'

// B6 (F6B) — confirma a assinatura do termo: registra data + (autor via anotação)
// e o termo sai das pendências (só 'sim' encerra). Sem upload do PDF (F5 5.5).
// Compartilhado pela ficha (seção Termos) e pela ação inline de /pendencias.
export function ConfirmarAssinaturaDialog({
  ativoId,
  trigger,
}: {
  ativoId: string
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(hojeISO())
  // Loading via useTransition (padrão único dos diálogos — OS-F11 T9): `enviando`
  // continua desabilitando os dois botões, então o duplo-submit segue impossível.
  const [enviando, start] = useTransition()

  function confirmar() {
    start(async () => {
      const res = await confirmarAssinaturaTermo({ ativo_id: ativoId, data })
      if (!res.ok) {
        toast.error(res.erro ?? 'Não foi possível confirmar a assinatura.')
        return
      }
      toast.success('Assinatura confirmada.')
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o)
        if (o) setData(hojeISO())
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <PenLine className="size-4" />
            Confirmar assinatura
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar assinatura do termo</DialogTitle>
          <DialogDescription>
            Registra que o termo foi assinado — a data e o seu nome ficam na linha
            do tempo, e o ativo sai das pendências. O PDF assinado não é anexado
            aqui.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="data-assinatura">Data da assinatura</Label>
          <Input
            id="data-assinatura"
            type="date"
            max={hojeISO()}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={enviando}>
            {enviando ? 'Confirmando…' : 'Confirmar assinatura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Ação inversa (B6): desfaz a confirmação. Volta a 'gerado' (se houver termo
// gerado cobrindo o ativo) ou 'nao', e registra o desfazer na linha do tempo.
// Confirmação explícita num diálogo mínimo para evitar clique acidental.
export function DesfazerAssinaturaDialog({ ativoId }: { ativoId: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  // Loading via useTransition (padrão único dos diálogos — OS-F11 T9): `enviando`
  // continua desabilitando os dois botões, então o duplo-submit segue impossível.
  const [enviando, start] = useTransition()
  const cancelarRef = useRef<HTMLButtonElement>(null)

  function desfazer() {
    start(async () => {
      const res = await desfazerConfirmacaoTermo({ ativo_id: ativoId })
      if (!res.ok) {
        toast.error(res.erro ?? 'Não foi possível desfazer a confirmação.')
        return
      }
      toast.success('Confirmação desfeita.')
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground"
        >
          <Undo2 className="size-3.5" />
          Desfazer
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-sm"
        // Foco inicial no Cancelar: a ação destrutiva nunca fica sob o Enter
        // (mesmo padrão de "revogar senha" da F9).
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Desfazer confirmação de assinatura</DialogTitle>
          <DialogDescription>
            O termo volta a constar como pendente (gerado ou não gerado) e o ativo
            reaparece nas pendências. A ação fica registrada na linha do tempo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancelarRef}
            variant="ghost"
            onClick={() => setAberto(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={desfazer} disabled={enviando}>
            {enviando ? 'Desfazendo…' : 'Desfazer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
