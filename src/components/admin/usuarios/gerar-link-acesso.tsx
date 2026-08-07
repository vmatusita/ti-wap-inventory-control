'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, KeyRound } from 'lucide-react'
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
import { gerarLinkDeAcesso } from '@/lib/actions/admin'

// F29/ADM-02b — "Gerar novo link de acesso" na PRÓPRIA linha do usuário.
//
// Antes, devolver o acesso a alguém exigia deduzir que se devia reabrir "Convidar
// usuário" e redigitar o e-mail — que está na coluna ao lado. O caminho de servidor é
// o mesmo do reenvio (link de recuperação; cargo e filiais intocados), com as duas
// travas do convite repetidas na action.
//
// O link aparece no MESMO padrão de cópia do convite: <code> com quebra + botão que
// vira "Copiado" por 2s.
export function GerarLinkAcesso({ email, nome }: { email: string; nome: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [gerando, start] = useTransition()

  function gerar() {
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition e quem
      // clicou fica sem retorno nenhum.
      try {
        const res = await gerarLinkDeAcesso({ email })
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        setLink(res.link)
        setAviso(res.aviso ?? null)
        setAberto(true)
        router.refresh()
      } catch {
        toast.error('Não foi possível gerar o link agora. Tente de novo.')
      }
    })
  }

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      toast.success('Link copiado.')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  function fechar(v: boolean) {
    setAberto(v)
    if (!v) {
      // O link é de uso único e some da tela ao fechar: mantê-lo em estado depois
      // disso só criaria a chance de entregar um token velho por engano.
      setLink(null)
      setAviso(null)
      setCopiado(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-1.5 sm:h-7"
        onClick={gerar}
        disabled={gerando}
      >
        <KeyRound className="size-4" />
        {gerando ? 'Gerando…' : 'Gerar novo link'}
      </Button>

      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link de acesso gerado</DialogTitle>
            <DialogDescription>
              Envie este link para <strong>{nome}</strong> ({email}). Ao abrir, a
              pessoa clica em &quot;Continuar&quot;, confere o nome e define uma nova
              senha. Vale por tempo limitado — se expirar, é só gerar outro. Só o
              clique consome o link, então uma prévia no WhatsApp/Teams não o invalida.
            </DialogDescription>
          </DialogHeader>

          {aviso && (
            <p
              role="alert"
              className="rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {aviso}
            </p>
          )}

          {/* A mesma nota do reenvio pelo diálogo de convite: gerar link NÃO mexe em
              cargo nem em filiais — seria um atalho para rebaixar alguém por fora das
              travas de autoproteção. */}
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            O cargo e as filiais de escrita desta conta{' '}
            <strong>não foram alterados</strong> — este link só devolve o acesso. Para
            mudar cargo ou filiais, use <strong>Editar</strong> nesta mesma linha.
          </p>

          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{link}</code>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={copiar}
            >
              {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </Button>
          </div>

          <DialogFooter>
            <Button onClick={() => fechar(false)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
