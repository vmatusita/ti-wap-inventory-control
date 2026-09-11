'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Aviso } from '@/components/layout/aviso'
import { atualizarFilial, criarFilial } from '@/lib/actions/admin'

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type FilialEdit = {
  id: number
  nome: string
  slug: string
  ativo: boolean
  cidade: string
  totalAtivos: number
}

// Criar/editar filial (OS-F3 3.7.2). Ao desativar filial com ativos, o servidor
// bloqueia e mostra a contagem.
export function FilialDialog({ filial }: { filial?: FilialEdit }) {
  const router = useRouter()
  const edicao = !!filial
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(filial?.nome ?? '')
  const [slug, setSlug] = useState(filial?.slug ?? '')
  const [slugTocado, setSlugTocado] = useState(edicao)
  const [ativo, setAtivo] = useState(filial?.ativo ?? true)
  // F25 — a cidade que assina o TERMO desta filial.
  const [cidade, setCidade] = useState(filial?.cidade ?? '')
  // F29/UXG-05 — a recusa do servidor vive na TELA, não só num toast que some.
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, start] = useTransition()

  function mudarNome(v: string) {
    setNome(v)
    if (!slugTocado) setSlug(slugify(v))
  }

  const valido = nome.trim().length >= 2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)

  function salvar() {
    if (!valido) return
    setErro(null)
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition
      // (apaga a tela no error boundary) e o operador fica sem feedback.
      try {
        const res = edicao
          ? await atualizarFilial({
              id: filial.id,
              nome: nome.trim(),
              slug,
              ativo,
              cidade: cidade.trim(),
            })
          : await criarFilial({ nome: nome.trim(), slug, cidade: cidade.trim() })
        if (!res.ok) {
          // F29/UXG-05 — o erro ia SÓ por toast. Toast some sozinho, não é anunciado
          // como alerta e o diálogo continua aberto sem dizer o que houve: a recusa
          // mais comum aqui ("a filial tem N ativos") precisa ficar na tela ao lado do
          // campo que a causou. O toast permanece — quem estava olhando para outro
          // canto do diálogo continua sendo avisado.
          const msg = res.erro ?? 'Não foi possível salvar a filial.'
          setErro(msg)
          toast.error(msg)
          return
        }
        toast.success(edicao ? 'Filial atualizada.' : 'Filial criada.')
        setAberto(false)
        router.refresh()
      } catch {
        const msg =
          'Não foi possível salvar a filial. Verifique sua conexão e tente de novo.'
        setErro(msg)
        toast.error(msg)
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {edicao ? (
          <Button variant="outline" size="sm" className="min-h-10 gap-1.5 sm:min-h-0">
            <Pencil className="size-3.5" />
            Editar
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="size-4" />
            Nova filial
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edicao ? 'Editar filial' : 'Nova filial'}</DialogTitle>
          <DialogDescription>
            O slug entra na URL do relatório (ex.: /relatorios/{slug || 'linhares'}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="filial-nome">Nome</Label>
          <Input id="filial-nome" value={nome} onChange={(e) => mudarNome(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filial-slug">Slug</Label>
          <Input
            id="filial-slug"
            value={slug}
            onChange={(e) => {
              setSlugTocado(true)
              setSlug(slugify(e.target.value))
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="filial-cidade">Cidade</Label>
          <Input
            id="filial-cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Ex.: Linhares"
          />
          <p className="text-xs text-muted-foreground">
            Entra na linha da assinatura dos termos desta filial (por exemplo:
            Linhares, 4 de agosto de 2026). Deixar em branco faz o termo avisar na
            hora de gerar.
          </p>
        </div>

        {/* F56 (Frente A) — o import de startup não reconhece a filial pelo cadastro: ele
            confere a coluna Site da planilha pelo vocabulário de unidades. Sem este aviso,
            criar uma filial parece deixá-la pronta para importar, e o primeiro import dela
            é recusado. */}
        <Aviso intencao="informacao">
          <p>
            O import de startup reconhece a coluna Site da planilha só pelo vocabulário
            de unidades. Uma filial que ainda não esteja nele tem o import recusado com a
            mensagem «filial fora do vocabulário».
          </p>
        </Aviso>

        {edicao && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={ativo} onCheckedChange={(c) => setAtivo(c === true)} />
            Filial ativa
            {!ativo && filial.totalAtivos > 0 && (
              <span className="text-xs text-destructive">
                ({filial.totalAtivos} ativo(s) — o servidor pode bloquear)
              </span>
            )}
          </label>
        )}

        {erro && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {erro}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando || !valido}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
