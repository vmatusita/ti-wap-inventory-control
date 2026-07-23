'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { atualizarItem, criarItem, excluirItem } from '@/lib/actions/itens'
import { GRUPO_ITEM_META, GRUPO_ITEM_ORDEM, type GrupoItem } from '@/lib/dominio'

type ItemEdit = {
  id: number
  nome: string
  grupo: GrupoItem
  ordem: number
  ativo: boolean
  lancamentos: number
}

// Criar/editar item do catálogo (F3B / OS 3.4 — padrão de admin/motivos). Item
// com lançamentos nunca é excluído (só desativado) — o histórico referencia.
export function ItemDialog({ item }: { item?: ItemEdit }) {
  const router = useRouter()
  const edicao = !!item
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(item?.nome ?? '')
  const [grupo, setGrupo] = useState<GrupoItem>(item?.grupo ?? 'acessorio')
  const [ordem, setOrdem] = useState(String(item?.ordem ?? 0))
  const [ativo, setAtivo] = useState(item?.ativo ?? true)
  const [enviando, start] = useTransition()

  const podeExcluir = edicao && item.lancamentos === 0
  const valido = nome.trim().length >= 2

  function salvar() {
    if (!valido) return
    const ordemNum = Number(ordem) || 0
    start(async () => {
      const res = edicao
        ? await atualizarItem({ id: item.id, nome: nome.trim(), grupo, ordem: ordemNum, ativo })
        : await criarItem({ nome: nome.trim(), grupo, ordem: ordemNum })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success(edicao ? 'Item atualizado.' : 'Item criado.')
      setAberto(false)
      router.refresh()
    })
  }

  function remover() {
    if (!edicao) return
    start(async () => {
      const res = await excluirItem({ id: item.id })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success('Item excluído.')
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
            Novo item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{edicao ? 'Editar item' : 'Novo item'}</DialogTitle>
          <DialogDescription>
            Catálogo de acessórios, periféricos e componentes controlados por quantidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="item-nome">Nome</Label>
            <Input
              id="item-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex.: Mouse USB, Memória notebook DDR4 8 GB"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-grupo">Grupo</Label>
              <Select value={grupo} onValueChange={(v) => setGrupo(v as GrupoItem)}>
                <SelectTrigger id="item-grupo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRUPO_ITEM_ORDEM.map((g) => (
                    <SelectItem key={g} value={g}>
                      {GRUPO_ITEM_META[g].titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-ordem">Ordem</Label>
              <Input
                id="item-ordem"
                type="number"
                inputMode="numeric"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
              />
            </div>
          </div>

          {edicao && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={ativo} onCheckedChange={(c) => setAtivo(c === true)} />
                Item ativo
              </label>
              <p className="text-xs text-muted-foreground">
                {item.lancamentos > 0
                  ? `Há ${item.lancamentos.toLocaleString('pt-BR')} lançamento(s) — o item não pode ser excluído, apenas desativado.`
                  : 'Sem lançamentos — pode ser excluído.'}
              </p>
            </>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {podeExcluir ? (
            <Button
              variant="ghost"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={remover}
              disabled={enviando}
            >
              <Trash2 className="size-4" />
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={enviando || !valido}>
              {enviando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
