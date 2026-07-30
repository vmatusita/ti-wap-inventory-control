'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { definirStatusUsuario } from '@/lib/actions/admin'

// Desativar / reativar o acesso de um usuário (F21). Mesmo desenho do `SenhaAcoes` das
// senhas de acesso: o caminho DESTRUTIVO confirma num Dialog com o foco inicial no Cancelar;
// reativar é um clique.
//
// O que "desativar" faz, e por que são duas coisas: `profiles.ativo = false` fecha toda
// escrita no REQUEST SEGUINTE (papel_atual() devolve NULL e as policies da 0063 fecham), e o
// ban no Supabase Auth impede LOGIN novo. Sem o primeiro, quem já está com a tela aberta
// continuaria registrando movimentação; sem o segundo, bastaria relogar.
export function StatusUsuarioAcoes({
  usuarioId,
  nome,
  ativo,
  eVoceMesmo,
}: {
  usuarioId: string
  nome: string
  ativo: boolean
  eVoceMesmo: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [aberto, setAberto] = useState(false)
  const cancelarRef = useRef<HTMLButtonElement>(null)

  function alternar() {
    start(async () => {
      try {
        const res = await definirStatusUsuario({ usuarioId, ativo: !ativo })
        if (!res.ok) {
          toast.error(res.erro, { duration: 10000 })
          return
        }
        if (res.aviso) toast.warning(res.aviso, { duration: 12000 })
        else toast.success(ativo ? 'Acesso desativado.' : 'Acesso reativado.')
        setAberto(false)
        router.refresh()
      } catch {
        // A mensagem diz em que estado o acesso CONTINUA, para ninguém repetir a ação "por
        // garantia" (mesma razão do SenhaAcoes).
        toast.error(
          ativo
            ? 'Não foi possível desativar — o acesso continua ativo. Verifique sua conexão e tente de novo.'
            : 'Não foi possível reativar — o acesso continua desativado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  if (!ativo) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="min-h-10 sm:min-h-0"
        onClick={alternar}
        disabled={pending}
      >
        {pending ? 'Reativando…' : 'Reativar'}
      </Button>
    )
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-h-10 sm:min-h-0"
          disabled={eVoceMesmo}
          title={eVoceMesmo ? 'Você não pode desativar o seu próprio acesso.' : undefined}
        >
          Desativar
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        // Foco inicial no Cancelar: a ação destrutiva nunca fica sob o Enter.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Desativar o acesso de {nome}?</DialogTitle>
          <DialogDescription>
            Esta pessoa perde a permissão de registrar qualquer coisa no{' '}
            <strong>próximo carregamento de página</strong>, mesmo com a tela já aberta, e
            não consegue mais entrar no sistema. O histórico dela (movimentações, termos,
            lançamentos) <strong>permanece intacto</strong> — desativar não apaga nada. Você
            pode reativar depois, nesta mesma lista.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancelarRef}
            type="button"
            variant="ghost"
            onClick={() => setAberto(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={alternar}
            disabled={pending}
          >
            {pending ? 'Desativando…' : 'Desativar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
