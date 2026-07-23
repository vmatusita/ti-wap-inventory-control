'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, UserPlus } from 'lucide-react'
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
import {
  DOMINIOS_OPERADOR,
  DOMINIOS_TEXTO,
  emailDeOperador,
} from '@/lib/auth/dominios-email'

type Gerado = { link: string; reenvio: boolean }

// Convite de operador — gera um LINK (sem depender do e-mail do Supabase, que
// tem limite ~2/h). O admin copia o link e envia por WhatsApp/Teams/e-mail. Mesmo
// padrão da senha de acesso (criar-senha-dialog): mostra → copia → entrega manual.
// Só os domínios da spec §3, validado no client E no server (OS-F3 3.7.1).
export function ConvidarUsuarioDialog() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState('')
  const [gerado, setGerado] = useState<Gerado | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviando, start] = useTransition()

  const valido = emailDeOperador(email)
  const erroDominio = email.length > 0 && !valido

  function fechar(open: boolean) {
    setAberto(open)
    if (!open) {
      setEmail('')
      setGerado(null)
      setCopiado(false)
    }
  }

  function convidar() {
    // `enviando` também aqui: o Enter do campo aciona esta função sem passar pelo
    // botão desabilitado — sem a guarda, dois Enters = dois convites.
    if (!valido || enviando) return
    start(async () => {
      const res = await convidarUsuario({ email: email.trim() })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      setGerado({ link: res.link, reenvio: res.reenvio })
      router.refresh()
    })
  }

  async function copiar() {
    if (!gerado) return
    try {
      await navigator.clipboard.writeText(gerado.link)
      setCopiado(true)
      toast.success('Link copiado.')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="size-4" />
          Convidar usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        {gerado ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {gerado.reenvio ? 'Link de acesso gerado' : 'Convite gerado — copie o link'}
              </DialogTitle>
              <DialogDescription>
                {gerado.reenvio
                  ? 'Esse e-mail já tinha conta. Envie este link para a pessoa; ao abrir, ela clica em "Continuar" e define uma nova senha para entrar.'
                  : 'Envie este link para a pessoa (WhatsApp, Teams, e-mail). Ao abrir, ela clica em "Ativar meu acesso" e define a senha.'}{' '}
                Vale por tempo limitado — se expirar, é só gerar outro. Só o clique
                em ativar consome o link, então uma prévia no WhatsApp/Teams não o
                invalida.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">
                {gerado.link}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5"
                onClick={copiar}
              >
                {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => fechar(false)}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Convidar operador</DialogTitle>
              <DialogDescription>
                Gera um <strong>link de convite</strong> para você enviar à pessoa
                (sem e-mail automático). Só e-mails <strong>{DOMINIOS_TEXTO}</strong>{' '}
                são aceitos. Todo operador tem o mesmo nível de acesso.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="convite-email">E-mail</Label>
              <Input
                id="convite-email"
                type="email"
                placeholder={`nome${DOMINIOS_OPERADOR[0]}`}
                value={email}
                autoComplete="off"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && convidar()}
                aria-invalid={erroDominio}
                aria-describedby={erroDominio ? 'convite-email-erro' : undefined}
              />
              {erroDominio && (
                <p id="convite-email-erro" className="text-xs text-destructive">
                  O e-mail precisa terminar com {DOMINIOS_TEXTO}.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => fechar(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={convidar} disabled={enviando || !valido}>
                {enviando ? 'Gerando…' : 'Gerar link'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
