'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { definirStatusSenha } from '@/lib/actions/senhas'

// Revogar / reativar uma senha de acesso (OS-F3 3.7.4). Revogar mata o acesso no
// request seguinte (o layout de relatório reconfere a senha ativa a cada request).
export function SenhaAcoes({ id, ativa }: { id: string; ativa: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function alternar() {
    start(async () => {
      const res = await definirStatusSenha(id, !ativa)
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success(ativa ? 'Senha revogada.' : 'Senha reativada.')
      router.refresh()
    })
  }

  return (
    <Button
      variant={ativa ? 'outline' : 'secondary'}
      size="sm"
      onClick={alternar}
      disabled={pending}
    >
      {ativa ? 'Revogar' : 'Reativar'}
    </Button>
  )
}
