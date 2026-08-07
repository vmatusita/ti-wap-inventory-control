'use client'

import { Suspense, useActionState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { signIn, type LoginState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Marca } from '@/components/layout/marca'

const estadoInicial: LoginState = {}

// Mensagens dos redirects que caem em /login?erro=... (não são erros do submit).
const ERRO_QUERY: Record<string, string> = {
  'sessao-expirada': 'Sua sessão expirou, entre novamente.',
  // F21: cai aqui quem tem sessao viva mas o perfil foi DESATIVADO. Relogar nao resolve —
  // a mensagem tem de mandar falar com um administrador, nao tentar de novo.
  'acesso-desativado':
    'Seu acesso foi desativado. Fale com um administrador.',
  confirmacao:
    'Não foi possível confirmar o link. Peça um novo convite ou link de acesso.',
}

function LoginForm() {
  const searchParams = useSearchParams()
  const [state, formAction, pending] = useActionState(signIn, estadoInicial)
  // FLX-01 — destino guardado pelo proxy (sessão expirada / rota que exige
  // login). Viaja num campo oculto e é revalidado (`destinoSeguro`) na Server
  // Action — mesmo padrão do `next` da entrada por senha (AcessoForm).
  const next = searchParams.get('next') ?? ''

  // Erro genérico do submit (credenciais inválidas).
  useEffect(() => {
    if (state.erro) toast.error(state.erro)
  }, [state])

  // Erro vindo por query (?erro=): sessão expirada (B8) ou falha de confirmação
  // do link (auth/confirm) — antes era silenciosamente ignorado.
  useEffect(() => {
    const msg = ERRO_QUERY[searchParams.get('erro') ?? '']
    if (msg) toast.error(msg)
  }, [searchParams])

  // F19 — o toast some sozinho: quem errou a senha e olhou para o teclado ficava
  // sem nenhum sinal na tela. A mensagem também fica PERSISTENTE sob o formulário
  // (o toast continua, para quem está olhando na hora). O erro do SUBMIT tem
  // precedência sobre o de query: é o mais recente e o que descreve esta tentativa.
  const mensagemErro = state.erro ?? ERRO_QUERY[searchParams.get('erro') ?? '']

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@wap.ind.br"
          required
          aria-describedby={mensagemErro ? 'login-erro' : undefined}
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
          aria-describedby={mensagemErro ? 'login-erro' : undefined}
        />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </Button>
      {mensagemErro && (
        <p id="login-erro" role="alert" className="text-sm text-destructive">
          {mensagemErro}
        </p>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Esqueceu a senha? Peça a um administrador para reenviar o convite.
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-sm gap-0 overflow-hidden p-0">
        <div className="bg-brand-dark px-6 py-8 text-center">
          <Marca size="lg" labelClassName="text-white" />
        </div>

        <div className="px-6 py-6">
          {/* useSearchParams exige um limite de Suspense (Next 16 — bailout de
              renderização no cliente). O card/marca permanece sempre visível. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </Card>
    </div>
  )
}
