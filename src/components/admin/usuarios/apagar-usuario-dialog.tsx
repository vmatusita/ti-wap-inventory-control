'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apagarUsuario } from '@/lib/actions/dev'
import { dicaConfirmacaoNaoConfere } from '@/lib/validators/confirmacao-digitada'

// F22 — APAGAR a conta de um usuário. É a única ação IRREVERSÍVEL desta tela e é privativa
// do cargo Desenvolvedor (a lista só monta este diálogo para um dev; a action refaz a
// checagem com `exigirDev`, e a RPC `apagar_usuario` da 0074 exige `e_dev()` por dentro).
//
// Confirmação DIGITADA, no mesmo idioma do "Substituir tudo" do import: a pessoa redigita o
// e-mail da conta. Ela é ergonomia — quem autoriza é o cargo —, mas é o que separa este
// clique do "Desativar" logo ao lado, que é reversível.
//
// O projeto não tem `alert-dialog` (não instalamos componente novo na F22), então o padrão de
// confirmação destrutiva é o mesmo do `StatusUsuarioAcoes`: Dialog comum com o foco inicial
// no Cancelar, para a ação destrutiva nunca ficar sob o Enter.
export function ApagarUsuarioDialog({
  usuarioId,
  nome,
  email,
  open,
  onOpenChange,
}: {
  usuarioId: string
  nome: string
  /** E-mail da conta — é ele que a pessoa redigita para confirmar. */
  email: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [confirmacao, setConfirmacao] = useState('')
  const [apagando, start] = useTransition()
  const cancelarRef = useRef<HTMLButtonElement>(null)

  // Sem e-mail conhecido (o Supabase Auth não respondeu) não há o que confirmar — a action
  // recusa às cegas de propósito, e aqui o botão nem fica disponível.
  const confere =
    email !== null && confirmacao.trim().toLowerCase() === email.trim().toLowerCase()
  // ADM-07 (F27) — dica quando o texto digitado não bate com o e-mail. A régua de
  // igualdade (trim + caixa) já era a mesma de `validarExclusaoDeUsuario` (action) —
  // só a MENSAGEM estava faltando; antes o botão só ficava desabilitado, em silêncio.
  const dicaConfirmacao = email !== null ? dicaConfirmacaoNaoConfere(confirmacao, confere, email) : null

  function mudarAberto(o: boolean) {
    if (!o) setConfirmacao('')
    onOpenChange(o)
  }

  function apagar() {
    if (!confere || apagando) return
    start(async () => {
      try {
        const res = await apagarUsuario({ usuarioId, confirmacao: confirmacao.trim() })
        if (!res.ok) {
          toast.error(res.erro, { duration: 10000 })
          return
        }
        // O aviso aqui é grave (perfil arquivado, mas a conta do Auth não saiu): entra como
        // alerta longo, nunca como sucesso, para ninguém fechar a tela achando que acabou.
        if (res.aviso) toast.warning(res.aviso, { duration: 12000 })
        else toast.success('Conta apagada.')
        mudarAberto(false)
        router.refresh()
      } catch {
        // A mensagem diz em que estado a conta CONTINUA, para ninguém repetir "por garantia".
        toast.error(
          'Não foi possível apagar — a conta continua existindo. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={mudarAberto}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Apagar a conta de {nome}?</DialogTitle>
          <DialogDescription>
            Esta ação <strong>não tem volta</strong>.
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            A conta <strong>deixa de existir</strong> e esta pessoa{' '}
            <strong>não entra mais no sistema</strong> — não há &quot;reativar&quot; depois,
            como há em Desativar.
          </li>
          <li>
            O e-mail dela fica <strong>livre</strong>: dá para convidar alguém com esse
            mesmo endereço outra vez, e será uma conta nova, do zero.
          </li>
          <li>
            O <strong>histórico dela continua no sistema, com o nome dela</strong> —
            movimentações, termos e anotações que ela registrou permanecem exatamente como
            estão, porque o registro do que aconteceu não se apaga.
          </li>
        </ul>

        <div className="space-y-2">
          <Label htmlFor="dev-apagar-confirmacao">
            Para confirmar, digite o e-mail da conta
          </Label>
          {email ? (
            <p className="text-xs text-muted-foreground break-all">{email}</p>
          ) : (
            /* F29/UXG-05 — a irmã desta caixa (a dica da confirmação digitada) já
               tinha `role="alert"`; esta ficou de fora e é a que EXPLICA por que o
               diálogo não vai concluir. */
            <p role="alert" className="text-xs text-destructive">
              Não foi possível ler o e-mail desta conta agora — sem ele não dá para
              confirmar qual conta seria apagada. Atualize a página e tente de novo.
            </p>
          )}
          <Input
            id="dev-apagar-confirmacao"
            value={confirmacao}
            autoComplete="off"
            placeholder={email ?? ''}
            onChange={(e) => setConfirmacao(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apagar()}
            disabled={apagando || email === null}
            aria-invalid={!!dicaConfirmacao}
            aria-describedby={dicaConfirmacao ? 'dev-apagar-confirmacao-dica' : undefined}
          />
          {dicaConfirmacao && (
            <p id="dev-apagar-confirmacao-dica" role="alert" className="text-sm text-destructive">
              {dicaConfirmacao}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            ref={cancelarRef}
            type="button"
            variant="ghost"
            onClick={() => mudarAberto(false)}
            disabled={apagando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={apagar}
            disabled={apagando || !confere}
          >
            {apagando ? 'Apagando…' : 'Apagar conta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
