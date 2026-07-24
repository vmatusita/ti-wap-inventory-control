'use client'

import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { definirAcesso } from '@/lib/actions/auth'
import { definirAcessoSchema, NOME_PESSOA_MAX } from '@/lib/validators/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

// Nome + sobrenome + senha (migration 0057). O Zod roda aqui para o erro sair na
// hora, e DE NOVO dentro da Server Action — a checagem do cliente e conveniencia,
// nunca a barreira.
export function DefinirAcessoForm({
  nomeInicial,
  sobrenomeInicial,
}: {
  nomeInicial: string
  sobrenomeInicial: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const hidratado = useSyncExternalStore(semAssinatura, noCliente, noServidor)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const parsed = definirAcessoSchema.safeParse({
      nome: formData.get('nome'),
      sobrenome: formData.get('sobrenome'),
      senha: formData.get('senha'),
      confirmacao: formData.get('confirmacao'),
    })

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Verifique os campos')
      return
    }

    setPending(true)
    // try/catch (F13/B1): a action trata os erros que conhece e devolve
    // `{ ok: false }`. Se a CHAMADA rejeitar (rede caindo, 500), a rejeicao
    // apagaria a tela inteira no boundary — aqui ela vira toast e o formulario
    // continua preenchido.
    try {
      const res = await definirAcesso(parsed.data)
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success('Cadastro concluído. Bem-vindo(a)!')
      router.replace('/')
    } catch {
      toast.error('Não foi possível concluir agora. Tente de novo.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome"
          name="nome"
          type="text"
          autoComplete="given-name"
          maxLength={NOME_PESSOA_MAX}
          defaultValue={nomeInicial}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sobrenome">Sobrenome</Label>
        <Input
          id="sobrenome"
          name="sobrenome"
          type="text"
          autoComplete="family-name"
          maxLength={NOME_PESSOA_MAX}
          defaultValue={sobrenomeInicial}
          required
        />
        <p className="text-xs text-muted-foreground">
          É esse nome que aparece nos registros e nos termos que você gerar.
        </p>
      </div>
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
      <Button type="submit" className="h-11 w-full" disabled={pending || !hidratado}>
        {pending ? 'Salvando…' : 'Concluir cadastro'}
      </Button>
    </form>
  )
}
