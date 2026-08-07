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
  confirmarAssinaturaLote,
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
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador fica sem feedback. O erro de negócio (`{ok:false,erro}`) segue
      // tratado logo abaixo; o catch cobre só o throw cru.
      try {
        const res = await confirmarAssinaturaTermo({ ativo_id: ativoId, data })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível confirmar a assinatura.')
          return
        }
        toast.success('Assinatura confirmada.')
        setAberto(false)
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível confirmar a assinatura. Verifique sua conexão e tente de novo.',
        )
      }
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
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-sm">
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

// F28/PND-02 — confirma 1..N termos de UMA vez, com uma data ÚNICA para o lote
// inteiro (a pilha que volta do mutirão de assinatura tem a mesma data para
// todo mundo — pedir N datas seria pedir N cliques do mesmo valor). Usada só
// pela barra de seleção múltipla da fila (`FilaPendenciasTabela`); a linha
// individual continua com `ConfirmarAssinaturaDialog`, acima, sem mudança.
export function ConfirmarAssinaturaLoteDialog({
  ativoIds,
  trigger,
}: {
  ativoIds: string[]
  trigger: React.ReactNode
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(hojeISO())
  const [enviando, start] = useTransition()
  const n = ativoIds.length

  function confirmar() {
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador fica sem feedback. O erro de negócio (`{ok:false,erro}`) segue
      // tratado logo abaixo.
      try {
        const res = await confirmarAssinaturaLote({ ativo_ids: ativoIds, data })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível confirmar as assinaturas.')
          return
        }
        // Honestidade quando o lote encolhe (PND-02, critério 3): parte dos
        // termos pode já estar assinada (corrida com outra aba/pessoa) — o
        // toast então diz os dois números, não só "sucesso".
        if (res.ignorados > 0) {
          toast.success(
            res.confirmados > 0
              ? `${res.confirmados} ${res.confirmados === 1 ? 'assinatura confirmada' : 'assinaturas confirmadas'} — ${res.ignorados} ${res.ignorados === 1 ? 'já estava assinado' : 'já estavam assinados'}.`
              : `Nenhuma assinatura confirmada — ${res.ignorados === 1 ? 'o termo selecionado já estava assinado' : 'os termos selecionados já estavam assinados'}.`,
          )
        } else {
          toast.success(
            res.confirmados === 1
              ? 'Assinatura confirmada.'
              : `${res.confirmados} assinaturas confirmadas.`,
          )
        }
        setAberto(false)
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível confirmar as assinaturas. Verifique sua conexão e tente de novo.',
        )
      }
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {n > 1 ? `Confirmar assinatura de ${n} termos` : 'Confirmar assinatura do termo'}
          </DialogTitle>
          <DialogDescription>
            {n > 1
              ? 'Registra que os termos foram assinados, todos com a MESMA data — a data e o seu nome ficam na linha do tempo de cada ativo, e eles saem das pendências. O PDF assinado não é anexado aqui.'
              : 'Registra que o termo foi assinado — a data e o seu nome ficam na linha do tempo, e o ativo sai das pendências. O PDF assinado não é anexado aqui.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="data-assinatura-lote">Data da assinatura</Label>
          <Input
            id="data-assinatura-lote"
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
            {enviando ? 'Confirmando…' : `Confirmar assinatura (${n})`}
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
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador fica sem feedback. Como a ação desfaz um registro, a mensagem
      // diz que nada mudou — senão ele não sabe se deve tentar de novo.
      try {
        const res = await desfazerConfirmacaoTermo({ ativo_id: ativoId })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível desfazer a confirmação.')
          return
        }
        toast.success('Confirmação desfeita.')
        setAberto(false)
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível desfazer a confirmação — nada foi alterado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 gap-1.5 text-xs text-muted-foreground sm:h-7"
        >
          <Undo2 className="size-3.5" />
          Desfazer
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-sm"
        // Foco inicial no Cancelar: a ação destrutiva nunca fica sob o Enter
        // (mesmo padrão de "revogar senha" da F9).
        // `preventScroll` por consistência com o diálogo de estorno: o foco não
        // arrasta a rolagem do diálogo (nem a da página) para o rodapé.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus({ preventScroll: true })
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
