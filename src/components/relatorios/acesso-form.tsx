'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { entrarComSenha, type EntrarState } from '@/lib/actions/senhas'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Formulário da entrada por SENHA de acesso (público — spec §3 / OS-F3 3.9.1).
// `next` (destino guardado pelo proxy) é revalidado na Server Action; aqui só
// viaja num campo oculto. Erro sempre genérico ("Senha inválida").
const estadoInicial: EntrarState = {}

export function AcessoForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(entrarComSenha, estadoInicial)

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
          <p className="mt-2 text-sm text-white/70">Relatórios · acesso por senha</p>
        </div>

        <div className="px-6 py-6">
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="senha">Senha de acesso</Label>
              <Input
                id="senha"
                name="senha"
                type="password"
                autoComplete="off"
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Entrando…' : 'Entrar'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              É operador da WAP?{' '}
              <a href="/login" className="underline underline-offset-2">
                Entrar com sua conta
              </a>
            </p>
          </form>
        </div>
      </Card>
    </div>
  )
}
