'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { signIn, type LoginState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const estadoInicial: LoginState = {}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, estadoInicial)

  useEffect(() => {
    if (state.erro) toast.error(state.erro)
  }, [state])

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-sm gap-0 overflow-hidden p-0">
        <div className="bg-[#111110] px-6 py-8 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="rounded bg-[#eda100] px-2 py-1 text-sm font-bold tracking-tight text-black">
              WAP
            </span>
            <span className="text-lg font-semibold text-white">Estoque TI</span>
          </div>
        </div>

        <div className="px-6 py-6">
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@wap.ind.br"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending ? 'Entrando…' : 'Entrar'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Esqueceu a senha? Peça a um administrador para reenviar o convite.
            </p>
          </form>
        </div>
      </Card>
    </div>
  )
}
