'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, KeyRound, Wand2 } from 'lucide-react'
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
import { criarSenhaAcesso } from '@/lib/actions/senhas'

// Sem caracteres ambíguos (0/O, 1/l/I).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function gerarSenhaForte(tamanho = 16): string {
  const arr = new Uint32Array(tamanho)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => ALFABETO[n % ALFABETO.length]).join('')
}

// Criar senha de acesso (OS-F3 3.7.4): rótulo + senha manual ou gerada forte.
// A senha é exibida UMA única vez após salvar; guarda-se só o hash (no servidor).
export function CriarSenhaDialog() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [rotulo, setRotulo] = useState('')
  const [senha, setSenha] = useState('')
  const [criada, setCriada] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviando, start] = useTransition()

  const valido = rotulo.trim().length >= 2 && senha.length >= 8

  function fechar(open: boolean) {
    setAberto(open)
    if (!open) {
      setRotulo('')
      setSenha('')
      setCriada(null)
      setCopiado(false)
    }
  }

  function salvar() {
    if (!valido) return
    start(async () => {
      const res = await criarSenhaAcesso({ rotulo: rotulo.trim(), senha })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      setCriada(senha) // exibe UMA vez (já temos o texto no client)
      router.refresh()
    })
  }

  async function copiar() {
    if (!criada) return
    try {
      await navigator.clipboard.writeText(criada)
      setCopiado(true)
      toast.success('Senha copiada.')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <KeyRound className="size-4" />
          Nova senha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {criada ? (
          <>
            <DialogHeader>
              <DialogTitle>Senha criada — copie agora</DialogTitle>
              <DialogDescription>
                Esta é a única vez que a senha aparece. Guarde-a com segurança e
                entregue junto do link do relatório.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-sm">
                {criada}
              </code>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={copiar}>
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
              <DialogTitle>Nova senha de acesso</DialogTitle>
              <DialogDescription>
                Dá acesso somente aos relatórios (sem conta). Revogue
                individualmente se uma vazar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="senha-rotulo">Rótulo</Label>
              <Input
                id="senha-rotulo"
                placeholder="Filial Linhares, Stefanini…"
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha-valor">Senha</Label>
              <div className="flex gap-2">
                <Input
                  id="senha-valor"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="mínimo 8 caracteres"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => setSenha(gerarSenhaForte())}
                >
                  <Wand2 className="size-4" />
                  Gerar
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => fechar(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={enviando || !valido}>
                {enviando ? 'Criando…' : 'Criar senha'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
