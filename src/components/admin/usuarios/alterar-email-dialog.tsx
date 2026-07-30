'use client'

import { useState, useTransition } from 'react'
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
import { alterarEmailUsuario } from '@/lib/actions/dev'
import { DOMINIOS_OPERADOR, DOMINIOS_TEXTO, emailDeOperador } from '@/lib/auth/dominios-email'

// F22 — troca o E-MAIL DE LOGIN de uma conta que já existe. É uma das três ações da
// GESTÃO AVANÇADA, privativas do cargo Desenvolvedor: a lista de usuários só monta este
// diálogo quando quem está logado é dev. A recusa de verdade é do servidor (`exigirDev`
// na action, mais o domínio no schema Zod) — aqui é ergonomia.
//
// Diálogo CONTROLADO, sem gatilho próprio: quem abre é o menu "⋯" da linha.
export function AlterarEmailDialog({
  usuarioId,
  nome,
  emailAtual,
  open,
  onOpenChange,
}: {
  usuarioId: string
  nome: string
  /** Só contexto: mostra de qual endereço se está saindo. */
  emailAtual: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [salvando, start] = useTransition()

  const valor = email.trim()
  const emailValido = emailDeOperador(valor)
  // Só reclama depois de a pessoa ter digitado algo: abrir o diálogo já vermelho acusa
  // antes de alguém agir (mesmo critério do convite).
  const erroDominio = valor.length > 0 && !emailValido

  function mudarAberto(o: boolean) {
    // Fechar limpa o campo: reabrir volta ao estado do servidor, nunca ao rascunho
    // abandonado da vez anterior.
    if (!o) setEmail('')
    onOpenChange(o)
  }

  function salvar() {
    // A guarda do `salvando` também aqui: o Enter do campo chama esta função sem passar
    // pelo botão desabilitado — sem ela, dois Enters = duas trocas.
    if (!emailValido || salvando) return
    start(async () => {
      // Sem o catch, um throw de rede sobe pelo startTransition e apaga a tela no error
      // boundary (F19) — quem executou não saberia se o e-mail mudou.
      try {
        const res = await alterarEmailUsuario({ usuarioId, email: valor })
        if (!res.ok) {
          toast.error(res.erro, { duration: 10000 })
          return
        }
        if (res.aviso) toast.warning(res.aviso, { duration: 12000 })
        else toast.success('E-mail de login alterado.')
        mudarAberto(false)
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível alterar o e-mail — nada foi mudado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={mudarAberto}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar o e-mail de {nome}</DialogTitle>
          <DialogDescription>
            A troca vale <strong>na hora</strong>: a partir do próximo login esta pessoa
            entra com o endereço novo, e o antigo deixa de servir. Ela não precisa
            confirmar nada por e-mail e a senha dela continua a mesma. O e-mail precisa ser
            de domínio corporativo — só <strong>{DOMINIOS_TEXTO}</strong> são aceitos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">E-mail de hoje</Label>
            <p className="text-sm font-medium break-all">
              {emailAtual ?? (
                <span className="text-muted-foreground italic">
                  Não foi possível ler o e-mail atual
                </span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dev-email-novo">Novo e-mail</Label>
            <Input
              id="dev-email-novo"
              type="email"
              placeholder={`nome${DOMINIOS_OPERADOR[0]}`}
              value={email}
              autoComplete="off"
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && salvar()}
              aria-invalid={erroDominio}
              aria-describedby={erroDominio ? 'dev-email-novo-erro' : undefined}
              disabled={salvando}
            />
            {erroDominio && (
              <p id="dev-email-novo-erro" className="text-xs text-destructive">
                O e-mail precisa terminar com {DOMINIOS_TEXTO}.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => mudarAberto(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !emailValido}>
            {salvando ? 'Alterando…' : 'Alterar e-mail'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
