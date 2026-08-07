'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MIN_JUSTIFICATIVA, confirmacaoConfere } from '@/lib/validators/dev-destrutivo'
import { dicaConfirmacaoNaoConfere } from '@/lib/validators/confirmacao-digitada'

// O diálogo de confirmação das SETE ferramentas destrutivas (F23) — um só, para as sete.
//
// Molde: `apagar-usuario-dialog.tsx` (F22). O projeto não tem `alert-dialog` (nenhuma
// dependência nova nesta fase), então o padrão de confirmação destrutiva continua sendo o
// Dialog comum com o foco inicial no CANCELAR — a ação destrutiva nunca fica sob o Enter.
//
// O que este componente acrescenta ao molde da F22 e por quê:
//   · JUSTIFICATIVA obrigatória, ao lado da confirmação digitada. Ela é o único conteúdo do
//     evento de auditoria que explica POR QUE o dado deixou de existir — depois da exclusão,
//     não há mais a que voltar para descobrir.
//   · O RESUMO do estrago (`children`) vem de contagens lidas do banco na hora, e não de um
//     texto fixo: "este ativo tem 7 movimentações e 1 termo" é o que transforma o clique numa
//     decisão informada.
//   · O `Enter` no campo de confirmação NÃO dispara a ação (ao contrário do diálogo da F22,
//     onde só havia um campo): aqui existe um textarea logo abaixo, e submeter no meio do
//     preenchimento seria fácil demais. Só o botão executa.
export function DialogoDestrutivo({
  open,
  onOpenChange,
  titulo,
  descricao,
  esperado,
  rotuloBotao,
  mensagemSucesso,
  children,
  onConfirmar,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  titulo: string
  descricao?: ReactNode
  /** O texto que a pessoa precisa redigitar (patrimônio, nome do item, nome da filial…). */
  esperado: string
  rotuloBotao: string
  mensagemSucesso: string
  /** O resumo do que vai ser destruído — contagens reais, lidas na hora. */
  children?: ReactNode
  onConfirmar: (
    confirmacao: string,
    justificativa: string,
  ) => Promise<{ ok: true; aviso?: string } | { ok: false; erro: string }>
}) {
  const router = useRouter()
  const [confirmacao, setConfirmacao] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [executando, start] = useTransition()
  const cancelarRef = useRef<HTMLButtonElement>(null)

  // Fechar limpa os campos AQUI, no handler — não num efeito.
  //
  // ⚠ Não é preferência de estilo: `setState` dentro de `useEffect` é erro de lint no projeto
  // (`react-hooks/set-state-in-effect`) e, pior, seria supérfluo — os painéis montam este
  // diálogo condicionalmente (`{dialogo && <DialogoDestrutivo …/>}`), então desmontar já
  // zeraria o estado. O que precisa mesmo de garantia é o caminho de fechar sem desmontar, e
  // esse passa por aqui. Confirmação de uma exclusão anterior sobrevivendo na caixa seria a
  // pior espécie de conveniência.
  function fechar(o: boolean) {
    if (!o) {
      setConfirmacao('')
      setJustificativa('')
    }
    onOpenChange(o)
  }

  const confere = confirmacaoConfere(confirmacao, esperado)
  // ADM-07 (F27) — a dica que faltava. `confere` já existia e só alimentava `pronto`:
  // com um caractere errado, o botão ficava desabilitado e MUDO, que é exatamente o
  // sintoma que o item veio corrigir. A régua (trim + caixa, `confirmacaoConfere`) não
  // muda — as RPCs 0082/0083 já toleram o mesmo —, só a mensagem entra.
  const dicaConfirmacao = dicaConfirmacaoNaoConfere(confirmacao, confere, esperado)
  const justificativaOk = justificativa.trim().length >= MIN_JUSTIFICATIVA
  const pronto = confere && justificativaOk && !executando

  function executar() {
    if (!pronto) return
    start(async () => {
      try {
        const res = await onConfirmar(confirmacao.trim(), justificativa.trim())
        if (!res.ok) {
          toast.error(res.erro, { duration: 12000 })
          return
        }
        // Aviso é sempre GRAVE aqui (arquivo órfão no Storage, por exemplo): entra como alerta
        // longo, nunca como sucesso, para ninguém fechar a tela achando que acabou limpo.
        if (res.aviso) toast.warning(res.aviso, { duration: 15000 })
        else toast.success(mensagemSucesso)
        fechar(false)
        router.refresh()
      } catch {
        // A mensagem diz em que estado o dado CONTINUA, para ninguém repetir "por garantia" —
        // e repetir uma operação destrutiva por garantia é como se apaga duas coisas.
        toast.error(
          'Não foi possível concluir — pelo que sabemos, nada foi alterado. Confira a conexão, recarregue a página e veja o estado atual antes de tentar de novo.',
          { duration: 12000 },
        )
      }
    })
  }

  const faltam = MIN_JUSTIFICATIVA - justificativa.trim().length

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {descricao ?? (
              <>
                Esta ação <strong>não tem volta</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {children}

        <div className="space-y-2">
          <Label htmlFor="destrutivo-confirmacao">Para confirmar, digite exatamente:</Label>
          <p className="font-mono text-xs break-all text-muted-foreground">{esperado}</p>
          <Input
            id="destrutivo-confirmacao"
            value={confirmacao}
            autoComplete="off"
            spellCheck={false}
            placeholder={esperado}
            onChange={(e) => setConfirmacao(e.target.value)}
            disabled={executando}
            aria-invalid={!!dicaConfirmacao}
            aria-describedby={dicaConfirmacao ? 'destrutivo-confirmacao-dica' : undefined}
          />
          {dicaConfirmacao && (
            <p id="destrutivo-confirmacao-dica" role="alert" className="text-sm text-destructive">
              {dicaConfirmacao}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="destrutivo-justificativa">
            Justificativa <span className="text-muted-foreground">(obrigatória)</span>
          </Label>
          <Textarea
            id="destrutivo-justificativa"
            value={justificativa}
            rows={3}
            placeholder="Por que este registro precisa deixar de existir?"
            onChange={(e) => setJustificativa(e.target.value)}
            disabled={executando}
          />
          <p className="text-xs text-muted-foreground">
            {justificativaOk
              ? 'Fica registrada na trilha de auditoria, junto com a cópia do que foi apagado.'
              : `Faltam ${faltam} caractere(s) — é o que vai explicar esta exclusão depois que o registro não existir mais.`}
          </p>
        </div>

        <DialogFooter>
          <Button
            ref={cancelarRef}
            type="button"
            variant="ghost"
            onClick={() => fechar(false)}
            disabled={executando}
          >
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={executar} disabled={!pronto}>
            {executando ? 'Executando…' : rotuloBotao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
