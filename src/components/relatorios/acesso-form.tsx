'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { entrarComSenha, type EntrarState } from '@/lib/actions/senhas'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Marca } from '@/components/layout/marca'

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
    <div className="flex min-h-svh items-center justify-center bg-muted px-4 py-12">
      <Card className="w-full max-w-sm gap-0 overflow-hidden p-0">
        <div className="bg-brand-dark px-6 py-8 text-center">
          <Marca size="lg" labelClassName="text-brand-dark-texto" />
          <p className="mt-2 text-sm text-brand-dark-texto/70">Relatórios · acesso por senha</p>
        </div>

        <div className="px-6 py-6">
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="senha">Senha de acesso</Label>
              {/* current-password (não "off"): senha de longa vida, sessão de 24h — o
                  gestor redigitava de memória todo dia porque o gerenciador de senhas
                  não oferecia guardar (RV-18, docs/ANALISE-RELATORIOS-2026-08-10.md §2). */}
              <Input
                id="senha"
                name="senha"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending ? 'Entrando…' : 'Entrar'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              É operador da WAP?{' '}
              <a href="/login" className="underline underline-offset-2">
                Entrar com sua conta
              </a>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Não tem a senha? Peça à TI da WAP.
            </p>
          </form>
        </div>
      </Card>
    </div>
  )
}
