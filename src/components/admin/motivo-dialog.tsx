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
import { atualizarMotivo, criarMotivo } from '@/lib/actions/admin'
import { Constants } from '@/lib/types/database'
import { rotuloTipo, type TipoMovimentacao } from '@/lib/dominio'

const TIPOS = Constants.public.Enums.tipo_movimentacao

function codificar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

type MotivoEdit = {
  codigo: string
  rotulo: string
  aplica_a: TipoMovimentacao[]
  ativo: boolean
}

// Criar/editar motivo (OS-F3 3.7.3). Nunca exclui — só edita/desativa (o
// histórico referencia o código).
export function MotivoDialog({ motivo }: { motivo?: MotivoEdit }) {
  const router = useRouter()
  const edicao = !!motivo
  const [aberto, setAberto] = useState(false)
  const [rotulo, setRotulo] = useState(motivo?.rotulo ?? '')
  const [codigo, setCodigo] = useState(motivo?.codigo ?? '')
  const [codigoTocado, setCodigoTocado] = useState(edicao)
  const [ativo, setAtivo] = useState(motivo?.ativo ?? true)
  const [aplicaA, setAplicaA] = useState<Set<TipoMovimentacao>>(
    new Set(motivo?.aplica_a ?? ['saida']),
  )
  const [enviando, start] = useTransition()

  function mudarRotulo(v: string) {
    setRotulo(v)
    if (!codigoTocado) setCodigo(codificar(v))
  }

  function toggle(t: TipoMovimentacao, on: boolean) {
    setAplicaA((prev) => {
      const s = new Set(prev)
      if (on) s.add(t)
      else s.delete(t)
      return s
    })
  }

  const valido =
    rotulo.trim().length >= 2 &&
    /^[a-z0-9_]+$/.test(codigo) &&
    aplicaA.size > 0

  function salvar() {
    if (!valido) return
    const aplica_a = [...aplicaA]
    start(async () => {
      const res = edicao
        ? await atualizarMotivo({ codigo: motivo.codigo, rotulo: rotulo.trim(), aplica_a, ativo })
        : await criarMotivo({ codigo, rotulo: rotulo.trim(), aplica_a })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success(edicao ? 'Motivo atualizado.' : 'Motivo criado.')
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
            Novo motivo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{edicao ? 'Editar motivo' : 'Novo motivo'}</DialogTitle>
          <DialogDescription>
            Vocabulário oferecido na tela de movimentação. O código é fixo depois
            de criado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="motivo-rotulo">Rótulo</Label>
            <Input id="motivo-rotulo" value={rotulo} onChange={(e) => mudarRotulo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="motivo-codigo">Código</Label>
            <Input
              id="motivo-codigo"
              value={codigo}
              disabled={edicao}
              onChange={(e) => {
                setCodigoTocado(true)
                setCodigo(codificar(e.target.value))
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {/* Grupo de checkboxes: sem control único, o rótulo se liga por
              `role="group"` + `aria-labelledby` (um <label> solto não nomeia nada). */}
          <Label id="motivo-aplica-a">Aplica-se a</Label>
          <div
            role="group"
            aria-labelledby="motivo-aplica-a"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {TIPOS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={aplicaA.has(t)}
                  onCheckedChange={(c) => toggle(t, c === true)}
                />
                {rotuloTipo(t)}
              </label>
            ))}
          </div>
        </div>

        {edicao && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={ativo} onCheckedChange={(c) => setAtivo(c === true)} />
            Motivo ativo
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
