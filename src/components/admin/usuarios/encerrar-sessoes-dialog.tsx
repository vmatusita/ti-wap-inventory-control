'use client'

import { useRef, useTransition } from 'react'
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
} from '@/components/ui/dialog'
import { encerrarSessoes } from '@/lib/actions/dev'

// F22 — encerra as SESSÕES ABERTAS de um usuário (apaga as linhas de `auth.sessions` pela
// RPC `encerrar_sessoes_usuario`, migration 0074). Privativa do cargo Desenvolvedor.
//
// ⚠ O TEXTO DESTE DIÁLOGO É O LIMITE HONESTO DA AÇÃO, e não enfeite: isto derruba a
// RENOVAÇÃO do acesso, não o acesso que já está aberto no navegador da pessoa — o token
// corrente continua valendo até expirar (cerca de 1 hora). Quem precisa de corte IMEDIATO
// tem que DESATIVAR o acesso, que fecha leitura e escrita no request seguinte. Sem isso, quem
// clica aqui acha que cortou na hora e não cortou — que é exatamente o caso em que a ação
// costuma ser usada.
export function EncerrarSessoesDialog({
  usuarioId,
  nome,
  eVoceMesmo,
  open,
  onOpenChange,
}: {
  usuarioId: string
  nome: string
  /**
   * A própria conta de quem está logado. Não é proibido (a RPC aceita, e é o caminho de quem
   * quer derrubar um aparelho esquecido em outro lugar), mas a tela avisa: a sessão desta aba
   * também está na conta, e a próxima renovação vai pedir login de novo.
   */
  eVoceMesmo: boolean
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [encerrando, start] = useTransition()
  const cancelarRef = useRef<HTMLButtonElement>(null)

  function encerrar() {
    if (encerrando) return
    start(async () => {
      try {
        const res = await encerrarSessoes({ usuarioId })
        if (!res.ok) {
          toast.error(res.erro, { duration: 10000 })
          return
        }
        // A action sempre devolve aviso aqui (quantas sessões caíram + o limite de ~1h), e
        // ele é a informação principal — por isso `toast.warning` longo, não `success`.
        if (res.aviso) toast.warning(res.aviso, { duration: 12000 })
        else toast.success('Sessões encerradas.')
        onOpenChange(false)
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível encerrar as sessões — nada foi mudado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-md"
        // Foco inicial no Cancelar, como nas demais confirmações desta tela.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Encerrar as sessões de {nome}?</DialogTitle>
          <DialogDescription>
            A pessoa passa a precisar entrar de novo com e-mail e senha nos aparelhos em que
            estava conectada. O cargo, as filiais e o histórico dela não mudam em nada.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
          <strong>Isto não corta o acesso na hora.</strong> O que cai é a{' '}
          <strong>renovação</strong> do acesso: se ela estiver com o sistema aberto no
          navegador neste momento, aquela sessão pode continuar valendo por{' '}
          <strong>até cerca de 1 hora</strong>. Para cortar imediatamente — leitura e escrita
          —, o caminho é <strong>Desativar</strong> o acesso desta pessoa.
        </p>

        {eVoceMesmo && (
          <p className="text-sm text-muted-foreground">
            Esta é a <strong>sua própria conta</strong>: a sessão desta aba também entra na
            conta e você vai precisar entrar de novo.
          </p>
        )}

        <DialogFooter>
          <Button
            ref={cancelarRef}
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={encerrando}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={encerrar} disabled={encerrando}>
            {encerrando ? 'Encerrando…' : 'Encerrar sessões'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
