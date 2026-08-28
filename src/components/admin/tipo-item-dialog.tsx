'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarTipoItem, atualizarTipoItem } from '@/lib/actions/tipos-item'
import { sugerirSlug } from '@/lib/validators/tipo-item'
import type { TipoItemAdmin } from '@/lib/queries/tipos-item'

// Criar/editar tipo de item (F37 · D7). Molde do `item-dialog.tsx` (ADM-01/F27): o
// MESMO componente serve criação e edição, diferenciado por receber ou não `tipo`;
// estado local por campo (sem react-hook-form — a validação de verdade é a Zod da
// Server Action); `useTransition` para o pending; toasts pelo sonner; `router.refresh()`
// no sucesso, porque quem revalida as rotas é a própria action.
//
// A DIFERENÇA FRENTE AO item-dialog: aqui NÃO existe excluir, e o campo CÓDIGO some
// na edição. Tipo citado no histórico (`movimentacoes.itens_faltantes`,
// `pendencias_item.item`) não pode ser apagado nem renomeado sem tornar ilegível o
// que já foi gravado — desativa-se. A migration 0114 diz o mesmo: nenhuma policy de
// DELETE, e `atualizarTipoItem` sequer aceita `slug` como parâmetro.

export function TipoItemDialog({ tipo }: { tipo?: TipoItemAdmin }) {
  const edicao = Boolean(tipo)
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [rotulo, setRotulo] = useState(tipo?.rotulo ?? '')
  const [slug, setSlug] = useState(tipo?.slug ?? '')
  const [slugEditado, setSlugEditado] = useState(false)
  const [ordem, setOrdem] = useState(String(tipo?.ordem ?? ''))
  const [ativo, setAtivo] = useState(tipo?.ativo ?? true)
  const [salvando, iniciar] = useTransition()

  const valido = rotulo.trim().length >= 2 && (edicao || slug.trim().length >= 2)

  function mudarAberto(v: boolean) {
    setAberto(v)
    if (!v) {
      setRotulo(tipo?.rotulo ?? '')
      setSlug(tipo?.slug ?? '')
      setSlugEditado(false)
      setOrdem(String(tipo?.ordem ?? ''))
      setAtivo(tipo?.ativo ?? true)
    }
  }

  // O código acompanha o nome ENQUANTO o admin não digitar um por conta própria —
  // depois disso o campo é dele. Mesmo comportamento do prefill da contrapartida
  // (F26): sugerir sem sequestrar.
  function mudarRotulo(v: string) {
    setRotulo(v)
    if (!edicao && !slugEditado) setSlug(sugerirSlug(v))
  }

  function salvar() {
    iniciar(async () => {
      try {
        const res = edicao
          ? await atualizarTipoItem({
              id: tipo!.id,
              rotulo: rotulo.trim(),
              ordem: Number(ordem) || 0,
              ativo,
            })
          : await criarTipoItem({
              slug: slug.trim(),
              rotulo: rotulo.trim(),
              ordem: Number(ordem) || 0,
            })
        if (!res.ok) {
          toast.error(res.erro ?? 'Não foi possível salvar o tipo.')
          return
        }
        toast.success(
          edicao
            ? 'Tipo atualizado.'
            : 'reativado' in res && res.reativado
              ? 'Este tipo já existia desativado e voltou ao catálogo.'
              : 'Tipo criado.',
        )
        mudarAberto(false)
        router.refresh()
      } catch {
        // F19 — sem o catch, o throw dentro do startTransition some no error boundary
        // e o admin fica olhando um botão que não responde.
        toast.error('Não foi possível salvar agora. Tente de novo.')
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogTrigger asChild>
        {edicao ? (
          <Button variant="ghost" size="sm">
            <Pencil aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Editar</span>
          </Button>
        ) : (
          <Button size="sm">
            <Plus aria-hidden="true" />
            Novo tipo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edicao ? 'Editar tipo' : 'Novo tipo de item'}</DialogTitle>
          <DialogDescription>
            {edicao
              ? 'O código não muda: ele é o que fica gravado no histórico das devoluções.'
              : 'O nome aparece nas telas; o código é o que fica gravado no histórico e não muda depois.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tipo-rotulo">Nome</Label>
            <Input
              id="tipo-rotulo"
              value={rotulo}
              onChange={(e) => mudarRotulo(e.target.value)}
              placeholder="Fone de ouvido"
              autoComplete="off"
            />
          </div>

          {edicao ? (
            <div className="grid gap-2">
              <Label>Código</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm text-muted-foreground">
                {tipo!.slug}
              </p>
              <p className="text-xs text-muted-foreground">
                O código não muda depois de criado — as devoluções já registradas
                guardam este texto.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="tipo-slug">Código</Label>
              <Input
                id="tipo-slug"
                value={slug}
                onChange={(e) => {
                  setSlugEditado(true)
                  setSlug(e.target.value)
                }}
                placeholder="fone_de_ouvido"
                autoComplete="off"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Minúsculas sem acento, começando por letra. É o que fica gravado, e
                não muda depois.
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="tipo-ordem">Ordem na lista (opcional)</Label>
            <Input
              id="tipo-ordem"
              inputMode="numeric"
              value={ordem}
              onChange={(e) => setOrdem(e.target.value.replace(/\D/g, ''))}
              placeholder="deixe em branco para entrar no fim"
              className="tabular-nums"
            />
          </div>

          {edicao && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="tipo-ativo"
                checked={ativo}
                onCheckedChange={(v) => setAtivo(v === true)}
              />
              <Label htmlFor="tipo-ativo" className="font-normal">
                Tipo ativo (desmarque para tirá-lo das listas sem apagar nada)
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={salvando}>
              Cancelar
            </Button>
          </DialogClose>
          <Button onClick={salvar} disabled={!valido || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
