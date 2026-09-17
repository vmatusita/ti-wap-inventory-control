'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, UserPlus } from 'lucide-react'
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
import { convidarUsuario } from '@/lib/actions/admin'
import {
  DOMINIOS_OPERADOR,
  DOMINIOS_TEXTO,
  emailDeOperador,
} from '@/lib/auth/dominios-email'
import { eDev, validarVinculosDoPapel } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import { CargoEFiliais, type FilialOpcao } from '@/components/admin/usuarios/cargo-e-filiais'

type Gerado = { link: string; reenvio: boolean }

// Convite de operador — gera um LINK (sem depender do e-mail do Supabase, que
// tem limite ~2/h). O admin copia o link e envia por WhatsApp/Teams/e-mail. Mesmo
// padrão da senha de acesso (criar-senha-dialog): mostra → copia → entrega manual.
// Só os domínios da spec §3, validado no client E no server (OS-F3 3.7.1).
//
// F21: o convite passou a escolher CARGO e FILIAIS DE ESCRITA. O cargo é gravado pela mesma
// action, via service role, logo depois de a conta nascer — nunca por `raw_user_meta_data`,
// que o próprio usuário consegue editar (ADR-002 §5).
//
// F22: a opção "Desenvolvedor" só aparece para quem JÁ é dev — mesma regra da edição. Um
// Administrador que a visse no convite geraria um link que a action recusa (`exigir_gestao_de`
// da RPC 0074), e o erro chegaria depois de a pessoa já ter combinado o acesso.
export function ConvidarUsuarioDialog({
  filiais,
  euPapel,
}: {
  filiais: readonly FilialOpcao[]
  /** Cargo de quem está convidando — vem de `getOperador()` na página. */
  euPapel: PapelUsuario
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState('')
  // Operador é o cargo do caso comum (quem registra movimentação no dia a dia). Admin não é
  // default de propósito: o convite mais frequente não deve entregar /admin sem alguém
  // escolher isso explicitamente.
  const [papel, setPapel] = useState<PapelUsuario>('operador')
  const [filiaisEscolhidas, setFiliaisEscolhidas] = useState<number[]>([])
  const [gerado, setGerado] = useState<Gerado | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviando, start] = useTransition()

  const souDev = eDev(euPapel)
  const erroCargo = validarVinculosDoPapel(papel, filiaisEscolhidas)
  const emailValido = emailDeOperador(email)
  const valido = emailValido && !erroCargo
  const erroDominio = email.length > 0 && !emailValido

  function fechar(open: boolean) {
    setAberto(open)
    if (!open) {
      setEmail('')
      setPapel('operador')
      setFiliaisEscolhidas([])
      setGerado(null)
      setCopiado(false)
    }
  }

  // Trocar o cargo limpa as filiais: guardá-las escondidas faria o payload de um Admin
  // carregar vínculos que o servidor recusa (`validarVinculosDoPapel`), e o operador veria
  // um erro que a tela não explica.
  function trocarPapel(p: PapelUsuario) {
    setPapel(p)
    setFiliaisEscolhidas([])
  }

  function convidar() {
    // `enviando` também aqui: o Enter do campo aciona esta função sem passar pelo
    // botão desabilitado — sem a guarda, dois Enters = dois convites.
    if (!valido || enviando) return
    start(async () => {
      // try/catch (F13/B1): `convidarUsuario` trata os erros que ela conhece e
      // devolve `{ ok: false }`. Se a chamada REJEITAR (rede caindo, servidor
      // 500, módulo de action que não avalia), a rejeição sobe pelo
      // startTransition até o boundary mais próximo e apaga a tela inteira. Aqui
      // ela vira toast, no mesmo padrão do `copiar()` abaixo, e o diálogo
      // continua aberto com o e-mail digitado.
      try {
        const res = await convidarUsuario({
          email: email.trim(),
          papel,
          filiais: filiaisEscolhidas,
        })
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        // O cargo pode não ter sido gravado mesmo com a conta criada — o aviso vem da
        // action e é ALERTA, não sucesso, para o admin não fechar a tela achando que acabou.
        if (res.aviso) toast.warning(res.aviso, { duration: 12000 })
        setGerado({ link: res.link, reenvio: res.reenvio })
        router.refresh()
      } catch {
        toast.error('Não foi possível gerar o link agora. Tente de novo.')
      }
    })
  }

  async function copiar() {
    if (!gerado) return
    try {
      await navigator.clipboard.writeText(gerado.link)
      setCopiado(true)
      toast.success('Link copiado.')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="size-4" />
          Convidar usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        {gerado ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {gerado.reenvio ? 'Link de acesso gerado' : 'Convite gerado — copie o link'}
              </DialogTitle>
              <DialogDescription>
                {gerado.reenvio
                  ? 'Esse e-mail já tinha conta. Envie este link para a pessoa; ao abrir, ela clica em "Continuar", informa (ou confere) nome e sobrenome e define uma nova senha para entrar.'
                  : 'Envie este link para a pessoa (WhatsApp, Teams, e-mail). Ao abrir, ela clica em "Ativar meu acesso" e informa nome, sobrenome e senha.'}{' '}
                Vale por tempo limitado — se expirar, é só gerar outro. Só o clique
                em ativar consome o link, então uma prévia no WhatsApp/Teams não o
                invalida.
              </DialogDescription>
            </DialogHeader>
            {/* Reenvio NÃO mexe em cargo (a action recusa esse atalho de propósito: seria
                uma forma de rebaixar alguém sem passar pelas travas de autoproteção). */}
            {gerado.reenvio && (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                O cargo e as filiais de escrita desta conta{' '}
                <strong>não foram alterados</strong> — este link só devolve o acesso. Para
                mudar cargo ou filiais, use <strong>Editar</strong> na lista de usuários.
              </p>
            )}
            <div className="flex items-center gap-2 rounded-md bg-muted/40 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">
                {gerado.link}
              </code>
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
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Convidar operador</DialogTitle>
              <DialogDescription>
                Gera um <strong>link de convite</strong> para você enviar à pessoa
                (sem e-mail automático). Só e-mails <strong>{DOMINIOS_TEXTO}</strong>{' '}
                são aceitos. O <strong>cargo</strong> escolhido aqui vale a partir do
                primeiro acesso.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="convite-email">E-mail</Label>
              <Input
                id="convite-email"
                type="email"
                placeholder={`nome${DOMINIOS_OPERADOR[0]}`}
                value={email}
                autoComplete="off"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && convidar()}
                aria-invalid={erroDominio}
                aria-describedby={erroDominio ? 'convite-email-erro' : undefined}
              />
              {erroDominio && (
                <p id="convite-email-erro" className="text-xs text-destructive">
                  O e-mail precisa terminar com {DOMINIOS_TEXTO}.
                </p>
              )}
            </div>

            <CargoEFiliais
              papel={papel}
              onPapelChange={trocarPapel}
              filiais={filiaisEscolhidas}
              onFiliaisChange={setFiliaisEscolhidas}
              opcoes={filiais}
              autorEDev={souDev}
              desabilitado={enviando}
              // Só reclama depois de o admin ter mexido em algo: abrir o diálogo já
              // vermelho ("escolha ao menos uma filial") acusa antes de a pessoa agir.
              erro={filiaisEscolhidas.length > 0 || email.length > 0 ? erroCargo : null}
            />

            <DialogFooter>
              <Button variant="ghost" onClick={() => fechar(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={convidar} disabled={enviando || !valido}>
                {enviando ? 'Gerando…' : 'Gerar link'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
