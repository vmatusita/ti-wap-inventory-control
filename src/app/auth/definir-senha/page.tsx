'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { novaSenhaSchema } from '@/lib/validators/auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Marca } from '@/components/layout/marca'

export default function DefinirSenhaPage() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

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
      toast.error('Nao foi possivel definir a senha. Tente novamente.')
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
          <form onSubmit={onSubmit} className="space-y-4">
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
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending ? 'Salvando…' : 'Definir senha'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  )
}
