'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
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
import { convidarUsuario } from '@/lib/actions/admin'

const DOMINIO = '@wap.ind.br'

// Convite de operador — só @wap.ind.br, validado no client E no server (OS-F3 3.7.1).
export function ConvidarUsuarioDialog() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState('')
  const [enviando, start] = useTransition()

  const valido = email.trim().toLowerCase().endsWith(DOMINIO)
  const erroDominio = email.length > 0 && !valido

  function convidar() {
    if (!valido) return
    start(async () => {
      const res = await convidarUsuario({ email: email.trim() })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success('Convite enviado.')
      setAberto(false)
      setEmail('')
      router.refresh()
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="size-4" />
          Convidar usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar operador</DialogTitle>
          <DialogDescription>
            A pessoa recebe um e-mail para definir a senha. Só e-mails{' '}
            <strong>{DOMINIO}</strong> são aceitos. Todo operador tem o mesmo
            nível de acesso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="convite-email">E-mail</Label>
          <Input
            id="convite-email"
            type="email"
            placeholder={`nome${DOMINIO}`}
            value={email}
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && convidar()}
            aria-invalid={erroDominio}
          />
          {erroDominio && (
            <p className="text-xs text-destructive">
              O e-mail precisa terminar com {DOMINIO}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={convidar} disabled={enviando || !valido}>
            {enviando ? 'Enviando…' : 'Enviar convite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
