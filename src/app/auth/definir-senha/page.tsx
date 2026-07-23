'use client'

import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { novaSenhaSchema } from '@/lib/validators/auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Marca } from '@/components/layout/marca'

// SEGURANCA (F13/A1): sinal de "ja hidratou". Antes da hidratacao o React ainda
// nao ligou o onSubmit (que faz preventDefault), entao um clique/Enter
// dispararia o submit NATIVO do formulario e a senha viajaria na URL —
// historico do celular, `Referer` e log de acesso da Vercel. Com o botao padrao
// desabilitado o navegador nao submete nem pela submissao implicita do Enter.
// useSyncExternalStore (e nao setState em efeito) e a forma sancionada de ler
// esse sinal: devolve `false` no HTML do servidor e na hidratacao, `true` depois.
const semAssinatura = () => () => {}
const noCliente = () => true
const noServidor = () => false

export default function DefinirSenhaPage() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const hidratado = useSyncExternalStore(semAssinatura, noCliente, noServidor)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const parsed = novaSenhaSchema.safeParse({
      senha: formData.get('senha'),
      confirmacao: formData.get('confirmacao'),
    })

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Verifique os campos')
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.senha,
    })
    setPending(false)

    if (error) {
      toast.error('Não foi possível definir a senha. Tente novamente.')
      return
    }

    toast.success('Senha definida. Bem-vindo(a)!')
    router.replace('/')
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-sm gap-0 overflow-hidden p-0">
        <div className="bg-brand-dark px-6 py-8 text-center">
          <Marca size="lg" labelClassName="text-white" />
          <p className="mt-3 text-sm text-white/70">Defina sua senha de acesso</p>
        </div>

        <div className="px-6 py-6">
          <form onSubmit={onSubmit} method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="senha">Nova senha</Label>
              <Input
                id="senha"
                name="senha"
                type="password"
                autoComplete="new-password"
                required
              />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmacao">Confirmar senha</Label>
              <Input
                id="confirmacao"
                name="confirmacao"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={pending || !hidratado}
            >
              {pending ? 'Salvando…' : 'Definir senha'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
