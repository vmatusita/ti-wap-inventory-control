'use client'

import { useState, useTransition } from 'react'
import { Check, KeyRound, X } from 'lucide-react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { testarSenhaAcesso } from '@/lib/actions/senhas'

// F29/ADM-05b — "essa senha ainda é a que eu passei?".
//
// Não havia como conferir: o hash é scrypt salgado e a senha em claro nunca é
// guardada, então a única saída era revogar e recriar — cortando o acesso de quem já
// usava a senha certa. Aqui o admin digita o que acha que é a senha e recebe SÓ
// confere / não confere.
//
// O texto digitado vive apenas no estado deste componente enquanto o diálogo está
// aberto: some ao fechar, não aparece em toast, não volta no retorno da action e não
// vai para trilha nenhuma.
export function TestarSenhaDialog({ id, rotulo }: { id: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState('')
  const [veredito, setVeredito] = useState<'confere' | 'nao-confere' | null>(null)
  const [testando, start] = useTransition()

  function fechar(open: boolean) {
    setAberto(open)
    if (!open) {
      setSenha('')
      setVeredito(null)
    }
  }

  function testar() {
    if (!senha) return
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition.
      try {
        const res = await testarSenhaAcesso({ id, senha })
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        setVeredito(res.confere ? 'confere' : 'nao-confere')
      } catch {
        toast.error('Não foi possível conferir a senha. Tente de novo.')
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-10 gap-1.5 sm:min-h-0">
          <KeyRound className="size-3.5" />
          Testar senha…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conferir a senha de acesso</DialogTitle>
          <DialogDescription>
            Digite a senha que você acha que é a de{' '}
            <span className="font-medium text-foreground">{rotulo}</span>. O sistema
            responde apenas se ela confere — nada é alterado, e o texto digitado não é
            guardado nem registrado em lugar nenhum.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="testar-senha">Senha</Label>
          <Input
            id="testar-senha"
            type="password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value)
              // Mudou o texto, o veredito antigo não vale mais: mantê-lo na tela
              // faria o admin ler "confere" sobre outra senha.
              setVeredito(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && senha && !testando) testar()
            }}
            autoComplete="off"
            placeholder="a senha que você entregou"
          />
        </div>

        {veredito === 'confere' && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-md border border-green-600/40 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          >
            <Check className="size-4 shrink-0" aria-hidden />
            Confere — é esta a senha ativa deste rótulo.
          </p>
        )}
        {veredito === 'nao-confere' && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <X className="size-4 shrink-0" aria-hidden />
            Não confere. A senha deste rótulo é outra — para trocá-la, revogue esta e
            crie uma nova.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => fechar(false)} disabled={testando}>
            Fechar
          </Button>
          <Button onClick={testar} disabled={testando || !senha}>
            {testando ? 'Conferindo…' : 'Conferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
