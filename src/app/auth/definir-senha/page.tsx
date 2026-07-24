import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { separarNomeSalvo } from '@/lib/auth/nome-pessoa'
import { Card } from '@/components/ui/card'
import { Marca } from '@/components/layout/marca'
import { DefinirAcessoForm } from './definir-acesso-form'

// Fecho do convite: nome, sobrenome e senha. Server Component porque precisa ler o
// perfil para PRE-PREENCHER os dois campos de nome — a mesma tela atende a
// recuperacao de senha de quem ja e operador, e obrigar essa pessoa a redigitar o
// proprio nome so para trocar a senha seria ruido (regra em lib/auth/nome-pessoa).
//
// Sem sessao ninguem tem o que fazer aqui (o formulario falharia no submit): quem
// chega por bookmark/link expirado vai para /login com a mensagem de link nao
// confirmado, em vez de bater numa tela morta.
export default async function DefinirSenhaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?erro=confirmacao')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('primeiro_nome, sobrenome')
    .eq('id', user.id)
    .maybeSingle()

  const inicial = separarNomeSalvo(perfil?.primeiro_nome, perfil?.sobrenome)

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-sm gap-0 overflow-hidden p-0">
        <div className="bg-brand-dark px-6 py-8 text-center">
          <Marca size="lg" labelClassName="text-white" />
          <p className="mt-3 text-sm text-white/70">
            Complete seu cadastro de acesso
          </p>
        </div>

        <div className="px-6 py-6">
          <DefinirAcessoForm
            nomeInicial={inicial.nome}
            sobrenomeInicial={inicial.sobrenome}
          />
        </div>
      </Card>
    </div>
  )
}
