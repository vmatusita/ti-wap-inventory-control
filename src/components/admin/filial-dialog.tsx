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
  const [enviando, start] = useTransition()

  function mudarNome(v: string) {
    setNome(v)
    if (!slugTocado) setSlug(slugify(v))
  }

  const valido = nome.trim().length >= 2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)

  function salvar() {
    if (!valido) return
    start(async () => {
      const res = edicao
        ? await atualizarFilial({ id: filial.id, nome: nome.trim(), slug, ativo })
        : await criarFilial({ nome: nome.trim(), slug })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success(edicao ? 'Filial atualizada.' : 'Filial criada.')
      setAberto(false)
      router.refresh()
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
