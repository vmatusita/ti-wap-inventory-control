'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { anotarAtivo } from '@/lib/actions/ativos'

// "Anotar" na ficha do ativo (F3B / OS 3.5): um clique, um texto, salvo com autor
// e data. É o "texto vermelho" da manutenção que evolui sem transição de estado.
export function AnotarDialog({ ativoId }: { ativoId: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, start] = useTransition()

  function salvar() {
    const t = texto.trim()
    if (t.length < 1) {
      toast.error('Escreva a anotação.')
      return
    }
    start(async () => {
      const res = await anotarAtivo({ ativo_id: ativoId, texto: t })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success('Anotação registrada.')
      setTexto('')
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2 sm:h-8">
          <StickyNote className="size-4" />
          Anotar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova anotação</DialogTitle>
          <DialogDescription>
            Uma nota na linha do tempo (ex.: “aguardando NF-e”, “cotação efetuada”).
            Fica registrada com seu nome e a data.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={2000}
          autoFocus
          placeholder="Escreva a anotação…"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando}>
            {enviando ? 'Salvando…' : 'Anotar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
