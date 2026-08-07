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
  // F29/ADM-05a — a URL pública, resolvida no servidor a partir da própria requisição
  // (não há NEXT_PUBLIC_APP_URL no ambiente). `null` = não deu para montar: a senha foi
  // criada do mesmo jeito e o diálogo simplesmente omite o link.
  const [url, setUrl] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<'nada' | 'senha' | 'mensagem'>('nada')
  const [enviando, start] = useTransition()

  const valido = rotulo.trim().length >= 2 && senha.length >= 8

  function fechar(open: boolean) {
    setAberto(open)
    if (!open) {
      setRotulo('')
      setSenha('')
      setCriada(null)
      setUrl(null)
      setCopiado('nada')
    }
  }

  // A mensagem pronta de colar no Teams/WhatsApp. O rótulo entra porque quem recebe
  // costuma ter mais de um acesso e precisa saber qual é este.
  const mensagem =
    criada && url
      ? [
          `Acesso ao relatório de estoque de TI (${rotulo.trim()}):`,
          url,
          `Senha: ${criada}`,
        ].join('\n')
      : null

  function salvar() {
    if (!valido) return
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition
      // (apaga a tela no error boundary) e o operador fica sem feedback. O
      // diálogo continua aberto com o rótulo e a senha digitados.
      try {
        const res = await criarSenhaAcesso({ rotulo: rotulo.trim(), senha })
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        setCriada(senha) // exibe UMA vez (já temos o texto no client)
        setUrl(res.url ?? null)
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível criar a senha. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  async function copiar(
    texto: string,
    qual: 'senha' | 'mensagem',
    sucesso: string,
  ): Promise<void> {
    // `copiar-patrimonio.tsx` é o modelo: checa a existência da API antes de tentar,
    // porque sem ela o `await` nem lança e a falha some.
    if (!navigator.clipboard?.writeText) {
      toast.error('Não foi possível copiar — copie manualmente.')
      return
    }
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(qual)
      toast.success(sucesso)
      setTimeout(() => setCopiado('nada'), 2000)
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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        {criada ? (
          <>
            <DialogHeader>
              <DialogTitle>Senha criada — copie agora</DialogTitle>
              <DialogDescription>
                Esta é a única vez que a senha aparece. Entregue junto do link de
                entrada — quem recebe precisa dos dois.
              </DialogDescription>
            </DialogHeader>

            {/* F29/ADM-05a — a tela mandava "entregue junto do link do relatório" e
                não fornecia link nenhum: o admin ia caçar o endereço na barra do
                navegador ou mandava só a senha, e a pessoa não sabia por onde entrar. */}
            {url && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  Endereço de entrada
                </p>
                <code className="block break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">
                  {url}
                </code>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Senha</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-sm">
                  {criada}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => copiar(criada, 'senha', 'Senha copiada.')}
                >
                  {copiado === 'senha' ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copiado === 'senha' ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>

            <DialogFooter className="sm:justify-between">
              {mensagem ? (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    copiar(mensagem, 'mensagem', 'Link e senha copiados.')
                  }
                >
                  {copiado === 'mensagem' ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copiado === 'mensagem' ? 'Copiado' : 'Copiar link e senha'}
                </Button>
              ) : (
                <span />
              )}
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
