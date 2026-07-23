'use client'

import { useId, useState, useTransition } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { criarItemInline } from '@/lib/actions/itens'
import { GRUPO_ITEM_META, GRUPO_ITEM_ORDEM, type GrupoItem } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { ItemCatalogo } from '@/lib/queries/itens'

// Combobox de item do carrinho de lançamento (F10 · I1/I2). Além de escolher,
// deixa CRIAR o item sem sair do dialog: item que falta no catálogo travava o
// lançamento inteiro (ir a /admin/itens, cadastrar, voltar, reabrir).
//
// A ação "criar" é um CommandItem de verdade (e não um botão dentro do
// CommandEmpty): assim ela é alcançável pelas SETAS do teclado, como o resto da
// lista. O CommandEmpty continua existindo para o caso de busca curta demais.
export function ItemCombobox({
  itens,
  valor,
  onSelecionar,
  onItemCriado,
  desabilitado,
  descricaoAcessivel,
}: {
  itens: ItemCatalogo[]
  valor: number | null
  onSelecionar: (id: number) => void
  onItemCriado: (item: ItemCatalogo) => void
  desabilitado?: boolean
  /** Ex.: "Item 2 do lançamento" — o rótulo visível é único para o bloco todo. */
  descricaoAcessivel: string
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [grupoNovo, setGrupoNovo] = useState<GrupoItem>('acessorio')
  const [salvando, start] = useTransition()
  const idNome = useId()

  const selecionado = itens.find((i) => i.id === valor)
  const buscaLimpa = busca.trim()
  const jaExiste = itens.some((i) => i.nome.trim().toLowerCase() === buscaLimpa.toLowerCase())
  const podeCriar = buscaLimpa.length >= 2 && !jaExiste

  function fechar(proximo: boolean) {
    setAberto(proximo)
    if (!proximo) {
      setCriando(false)
      setBusca('')
    }
  }

  function abrirCriacao() {
    setNomeNovo(buscaLimpa)
    setGrupoNovo('acessorio')
    setCriando(true)
  }

  function criar() {
    const nome = nomeNovo.trim()
    if (nome.length < 2) {
      toast.error('Informe o nome do item (mín. 2 caracteres).')
      return
    }
    start(async () => {
      const res = await criarItemInline({ nome, grupo: grupoNovo })
      if (!res.ok || !res.id) {
        toast.error(res.erro ?? 'Não foi possível criar o item.')
        return
      }
      // `estoque_minimo: 0` espelha o que `criarItemInline` gravou (default da
      // coluna 0042 = sem alerta de reposição) — o objeto local tem que bater
      // com a linha do banco, senão a lista da tela mentiria até o refresh.
      // Item REATIVADO (F12-W4-06) é a exceção: ele já existia e pode ter um
      // mínimo configurado. Não inventamos um valor — a próxima carga da tela
      // traz o real; até lá o combobox só precisa do id e do nome.
      onItemCriado({ id: res.id, nome, grupo: grupoNovo, estoque_minimo: 0 })
      onSelecionar(res.id)
      toast.success(
        res.reativado
          ? `Item “${nome}” já existia desativado e foi reativado.`
          : `Item “${nome}” criado.`,
      )
      fechar(false)
    })
  }

  return (
    <Popover open={aberto} onOpenChange={fechar}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          aria-label={
            selecionado
              ? `${descricaoAcessivel}: ${selecionado.nome}`
              : `${descricaoAcessivel}: nenhum item escolhido`
          }
          disabled={desabilitado}
          className="min-h-10 w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selecionado && 'text-muted-foreground')}>
            {selecionado ? selecionado.nome : 'Escolha o item…'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Tailwind v4: variável CSS em utilitário arbitrário é `w-(--var)`. Na
          forma v3 (`w-[--var]`) a classe não gera utilitário nenhum e o popover
          fica sem largura. */}
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        {criando ? (
          <div className="space-y-3 p-3">
            <div className="space-y-1.5">
              <Label htmlFor={idNome}>Nome do item novo</Label>
              <Input
                id={idNome}
                autoFocus
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    criar()
                  }
                }}
                placeholder="ex.: Headset USB"
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Grupo</span>
              <div className="flex gap-2">
                {GRUPO_ITEM_ORDEM.map((g) => (
                  <Button
                    key={g}
                    type="button"
                    size="sm"
                    variant={grupoNovo === g ? 'default' : 'outline'}
                    aria-pressed={grupoNovo === g}
                    className="min-h-10 flex-1"
                    onClick={() => setGrupoNovo(g)}
                  >
                    {GRUPO_ITEM_META[g].rotulo}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-10"
                onClick={() => setCriando(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="min-h-10"
                onClick={criar}
                disabled={salvando}
              >
                {salvando ? 'Criando…' : 'Criar item'}
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput
              placeholder="Buscar ou criar item…"
              autoFocus
              value={busca}
              onValueChange={setBusca}
            />
            <CommandList>
              <CommandEmpty>
                Nenhum item encontrado — digite ao menos 2 caracteres para criar.
              </CommandEmpty>
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
                          onSelecionar(i.id)
                          fechar(false)
                        }}
                      >
                        <Check
                          className={cn('mr-2 size-4', valor === i.id ? 'opacity-100' : 'opacity-0')}
                        />
                        {i.nome}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )
              })}
              {podeCriar && (
                <CommandGroup heading="Não achou?">
                  <CommandItem value={buscaLimpa} onSelect={abrirCriacao}>
                    <Plus className="mr-2 size-4" />
                    Criar item “{buscaLimpa}”
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
