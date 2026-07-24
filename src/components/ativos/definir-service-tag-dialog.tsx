'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tag } from 'lucide-react'
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
import { definirServiceTag } from '@/lib/actions/ativos'

// F15/C1 — DEFINE a service tag de um ativo importado SEM tag (pendência 'sem
// service tag'). Espelho do CorrigirPatrimonioDialog, mas SÓ para service tag vazia:
// uma vez preenchida, ela é IMUTÁVEL (identidade do equipamento) — a action recusa
// redefinir. A ficha só renderiza este diálogo quando a service tag está vazia. A tag
// é transcrita LITERAL da etiqueta (sem canonicalização, ao contrário do patrimônio).
export function DefinirServiceTagDialog({
  ativoId,
  patrimonio,
}: {
  ativoId: string
  // Só contexto (leitura) — ajuda o operador a confirmar de qual ativo se trata.
  patrimonio: string | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState('')
  // Loading via useTransition (padrão único dos diálogos — OS-F11 T9).
  const [enviando, start] = useTransition()

  const podeSalvar = valor.trim().length > 0 && !enviando

  function salvar() {
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador fica sem feedback. O erro de negócio (`{ok:false,erro}`) segue
      // tratado logo abaixo; o catch cobre só o throw cru.
      try {
        const res = await definirServiceTag({ ativo_id: ativoId, service_tag: valor.trim() })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível definir a service tag.')
          return
        }
        toast.success('Service tag definida.')
        setAberto(false)
        setValor('')
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível definir a service tag. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o)
        if (!o) setValor('')
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2 sm:h-8">
          <Tag className="size-4" />
          Definir service tag
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Definir service tag</DialogTitle>
          <DialogDescription>
            Informe a service tag deste ativo (importado sem tag). Ela é transcrita
            exatamente como está na etiqueta e, uma vez definida, é imutável (identifica
            o equipamento). A definição fica registrada na linha do tempo (com seu nome
            e a data) e encerra a pendência &quot;sem service tag&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Patrimônio</Label>
            <p className="text-sm font-medium tabular-nums">
              {patrimonio ?? (
                <span className="text-muted-foreground italic tabular-nums">
                  Sem patrimônio
                </span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-tag-nova">Service tag</Label>
            <Input
              id="service-tag-nova"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="ST-ABC123"
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!podeSalvar}>
            {enviando ? 'Salvando…' : 'Definir service tag'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
