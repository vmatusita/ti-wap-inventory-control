'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { definirStatusSenha } from '@/lib/actions/senhas'
import { TestarSenhaDialog } from '@/components/admin/testar-senha-dialog'

// Revogar / reativar uma senha de acesso (OS-F3 3.7.4). Revogar mata o acesso no
// request seguinte (o layout de relatório reconfere a senha ativa a cada request)
// — por ser destrutivo, confirma num Dialog (OS-F9 T4). Reativar continua em um
// clique: só o caminho destrutivo pede confirmação.
export function SenhaAcoes({
  id,
  ativa,
  rotulo,
}: {
  id: string
  ativa: boolean
  rotulo: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [aberto, setAberto] = useState(false)
  const cancelarRef = useRef<HTMLButtonElement>(null)

  function alternar() {
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador não sabe se a senha mudou de estado. A mensagem diz em que
      // estado a senha continua, para ninguém revogar/reativar "por garantia".
      try {
        const res = await definirStatusSenha(id, !ativa)
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        toast.success(ativa ? 'Senha revogada.' : 'Senha reativada.')
        setAberto(false)
        router.refresh()
      } catch {
        toast.error(
          ativa
            ? 'Não foi possível revogar a senha — ela continua ativa. Verifique sua conexão e tente de novo.'
            : 'Não foi possível reativar a senha — ela continua revogada. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  if (!ativa) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="min-h-10 sm:min-h-0"
        onClick={alternar}
        disabled={pending}
      >
        Reativar
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {/* F29/ADM-05b — só para senha ATIVA: conferir uma senha revogada não responde
          nada útil (ela não abre mais o relatório, confira ou não). */}
      <TestarSenhaDialog id={id} rotulo={rotulo} />
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="min-h-10 sm:min-h-0">
            Revogar
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-md"
          // Foco inicial no Cancelar: a ação destrutiva nunca fica sob o Enter.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            cancelarRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Revogar senha de acesso?</DialogTitle>
            <DialogDescription>
              A senha <span className="font-medium text-foreground">{rotulo}</span>{' '}
              deixa de valer. Quem usa esta senha perde o acesso aos relatórios no
              próximo carregamento. Você pode reativá-la depois, na mesma lista.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              ref={cancelarRef}
              type="button"
              variant="ghost"
              onClick={() => setAberto(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={alternar}
              disabled={pending}
            >
              {pending ? 'Revogando…' : 'Revogar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
