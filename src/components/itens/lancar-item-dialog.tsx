'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { lancarItem } from '@/lib/actions/itens'
import { lancamentoItemSchema } from '@/lib/validators/item'
import { hojeISO } from '@/lib/format'
import {
  GRUPO_ITEM_META,
  GRUPO_ITEM_ORDEM,
  TIPO_LANCAMENTO_META,
  type TipoLancamento,
} from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { ItemCatalogo, UltimoLancamento } from '@/lib/queries/itens'
import type { Filial } from '@/lib/queries/filiais'

const TIPOS: TipoLancamento[] = ['entrada', 'saida', 'reserva', 'liberacao', 'ajuste']

// Lançamento de quantidade (OS 3.3.2): dialog enxuto, meta ≤15s. "Repetir último"
// pré-preenche tudo menos a quantidade. Atalho `L` abre de qualquer lugar de
// /itens (o `N` já é da movimentação de ativos — decisão registrada em DECISOES).
export function LancarItemDialog({
  itens,
  filiais,
  ultimo,
}: {
  itens: ItemCatalogo[]
  filiais: Filial[]
  ultimo: UltimoLancamento | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [comboAberto, setComboAberto] = useState(false)
  const [itemId, setItemId] = useState<number | null>(null)
  const [filialId, setFilialId] = useState<number | null>(filiais[0]?.id ?? null)
  const [tipo, setTipo] = useState<TipoLancamento>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [chamado, setChamado] = useState('')
  const [colaborador, setColaborador] = useState('')
  const [data, setData] = useState(hojeISO())
  const [observacao, setObservacao] = useState('')
  const [enviando, start] = useTransition()
  const qtdRef = useRef<HTMLInputElement>(null)

  // Atalho `L` — abre o dialog quando o foco não está num campo de texto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat || aberto) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== 'l' && e.key !== 'L') return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (el?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (el?.getAttribute('role') === 'combobox') return
      e.preventDefault()
      setAberto(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto])

  function limpar() {
    setItemId(null)
    setTipo('entrada')
    setQuantidade('')
    setChamado('')
    setColaborador('')
    setData(hojeISO())
    setObservacao('')
  }

  function repetirUltimo() {
    if (!ultimo) return
    setItemId(ultimo.item_id)
    setFilialId(ultimo.filial_id)
    setTipo(ultimo.tipo)
    setChamado(ultimo.chamado ?? '')
    setColaborador(ultimo.colaborador ?? '')
    setQuantidade('')
    setData(hojeISO())
    setObservacao('')
    setTimeout(() => qtdRef.current?.focus(), 0)
  }

  const exigeChamado = tipo === 'reserva' || tipo === 'liberacao'
  const exigeObs = tipo === 'ajuste'
  const itemSelecionado = itens.find((i) => i.id === itemId)

  function salvar() {
    const input = {
      item_id: itemId ?? 0,
      filial_id: filialId ?? 0,
      tipo,
      quantidade: quantidade === '' ? NaN : Number(quantidade),
      chamado: chamado || undefined,
      colaborador: colaborador || undefined,
      data,
      observacao: observacao || undefined,
    }
    const parsed = lancamentoItemSchema.safeParse(input)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Revise os campos.')
      return
    }
    start(async () => {
      const res = await lancarItem(parsed.data)
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      toast.success('Lançamento registrado.')
      limpar()
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" />
          Lançar
          <kbd className="ml-1 hidden rounded border bg-background/20 px-1 text-[10px] sm:inline">
            L
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lançar quantidade</DialogTitle>
          <DialogDescription>
            Entrada, saída, reserva, liberação ou ajuste de um item por quantidade.
          </DialogDescription>
        </DialogHeader>

        {ultimo && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={repetirUltimo}
            disabled={enviando}
          >
            <RotateCcw className="size-3.5" />
            Repetir último
          </Button>
        )}

        <div className="space-y-3">
          {/* Item (combobox com busca) */}
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Popover open={comboAberto} onOpenChange={setComboAberto}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboAberto}
                  className="w-full justify-between font-normal"
                >
                  <span className={cn(!itemSelecionado && 'text-muted-foreground')}>
                    {itemSelecionado ? itemSelecionado.nome : 'Escolha o item…'}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar item…" autoFocus />
                  <CommandList>
                    <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                    {GRUPO_ITEM_ORDEM.map((g) => {
                      const doGrupo = itens.filter((i) => i.grupo === g)
                      if (!doGrupo.length) return null
                      return (
                        <CommandGroup key={g} heading={GRUPO_ITEM_META[g].titulo}>
                          {doGrupo.map((i) => (
                            <CommandItem
                              key={i.id}
                              value={i.nome}
                              onSelect={() => {
                                setItemId(i.id)
                                setComboAberto(false)
                              }}
                            >
                              <Check
                                className={cn('mr-2 size-4', itemId === i.id ? 'opacity-100' : 'opacity-0')}
                              />
                              {i.nome}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Filial</Label>
              <Select
                value={filialId ? String(filialId) : ''}
                onValueChange={(v) => setFilialId(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filial" />
                </SelectTrigger>
                <SelectContent>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoLancamento)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LANCAMENTO_META[t].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-qtd">
                Quantidade
                {exigeObs && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (negativa = baixa)
                  </span>
                )}
              </Label>
              <Input
                id="lanc-qtd"
                ref={qtdRef}
                type="number"
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder={exigeObs ? 'ex.: -3' : 'ex.: 10'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-chamado">
                Chamado{exigeChamado ? '' : ' (opcional)'}
              </Label>
              <Input
                id="lanc-chamado"
                inputMode="numeric"
                value={chamado}
                onChange={(e) => setChamado(e.target.value)}
                placeholder="nº do chamado"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-colab">Colaborador (opcional)</Label>
              <Input
                id="lanc-colab"
                value={colaborador}
                onChange={(e) => setColaborador(e.target.value)}
                placeholder="a quem se destina"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-data">Data</Label>
              <Input
                id="lanc-data"
                type="date"
                max={hojeISO()}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lanc-obs">
              Observação{exigeObs ? ' (justificativa do ajuste)' : ' (opcional)'}
            </Label>
            <Textarea
              id="lanc-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder={exigeObs ? 'Por que o ajuste?' : ''}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando}>
            {enviando ? 'Salvando…' : 'Lançar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
