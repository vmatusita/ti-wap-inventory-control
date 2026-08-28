'use client'

import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAX_ITENS_JUNTO } from '@/lib/validators/movimentacao'
import type { ItemDoCatalogo } from '@/lib/itens/ponte-tipo-item'
import type { ItemJunto } from '@/components/movimentacoes/nova/config'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { TipoMovimentacao } from '@/lib/dominio'

// "Itens que vão junto" (F38 · D13) — a seção OPCIONAL da ENTREGA.
//
// O PROBLEMA QUE ELA RESOLVE. O fone, o carregador e a mochila saíam com o
// notebook e o sistema não sabia: o periférico tinha de ser lançado à parte, na
// tela de itens, sem elo nenhum com a movimentação. "O que foi junto com este
// notebook" era um palpite sobre o campo `chamado`.
//
// O D13, LITERAL. Com vários equipamentos no lote, o operador escolhe A QUAL
// DELES cada periférico acompanha — o fone vai na movimentação do notebook, o
// cabo na do monitor. O padrão é o primeiro equipamento do lote, que é o caso
// comum (um equipamento, alguns acessórios). Com um equipamento só, o seletor de
// destino nem aparece: não há escolha a fazer.
//
// VAZIA, NADA MUDA. A seção é opcional em todos os sentidos: sem linha nenhuma o
// fluxo de hoje segue idêntico, e nenhum lançamento nasce.
//
// O TIPO DO LANÇAMENTO NÃO SE ESCOLHE AQUI. Ele é derivado no SERVIDOR do tipo da
// movimentação — entrega vira "Liberação" (`saida`), devolução vira "Retorno". O
// que sai daqui é só "qual item, quanto, com qual equipamento".

/** Os tipos de movimentação que carregam periférico na ida. */
export function ofereceItensJunto(tipo: TipoMovimentacao | ''): boolean {
  return tipo === 'saida' || tipo === 'emprestimo'
}

export function SecaoItensJunto({
  equipamentos,
  itensCatalogo,
  valor,
  onChange,
}: {
  equipamentos: AtivoResumo[]
  itensCatalogo: ItemDoCatalogo[]
  valor: ItemJunto[]
  onChange: (v: ItemJunto[]) => void
}) {
  const disponiveis = itensCatalogo.filter((i) => i.ativo)
  const varios = equipamentos.length > 1
  const cheio = valor.length >= MAX_ITENS_JUNTO

  function acrescentar() {
    if (cheio || disponiveis.length === 0) return
    onChange([...valor, { indice: 0, itemId: disponiveis[0].id, quantidade: 1 }])
  }

  function alterar(i: number, patch: Partial<ItemJunto>) {
    onChange(valor.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  }

  function remover(i: number) {
    onChange(valor.filter((_, k) => k !== i))
  }

  if (disponiveis.length === 0) return null

  return (
    <div className="grid gap-2">
      <Label>Itens que vão junto</Label>
      <p className="text-muted-foreground text-xs">
        Acessórios que saem com o equipamento. Cada um baixa do estoque da filial e passa a
        contar na conta da pessoa. Deixe vazio se nada vai junto.
      </p>

      <div className="grid gap-2 rounded-lg border p-3">
        {valor.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhum item por enquanto.</p>
        )}

        {valor.map((linha, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-48 flex-1 gap-1">
              <Label htmlFor={`item-junto-${i}`} className="text-xs">
                Item
              </Label>
              <Select
                value={String(linha.itemId)}
                onValueChange={(v) => alterar(i, { itemId: Number(v) })}
              >
                <SelectTrigger id={`item-junto-${i}`} className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((it) => (
                    <SelectItem key={it.id} value={String(it.id)}>
                      {it.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid w-24 gap-1">
              <Label htmlFor={`qtd-junto-${i}`} className="text-xs">
                Quantidade
              </Label>
              <Input
                id={`qtd-junto-${i}`}
                type="number"
                min={1}
                className="h-9 tabular-nums"
                value={linha.quantidade}
                onChange={(e) =>
                  alterar(i, { quantidade: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </div>

            {/* D13 — só com MAIS DE UM equipamento há escolha a fazer. */}
            {varios && (
              <div className="grid min-w-48 flex-1 gap-1">
                <Label htmlFor={`vai-com-${i}`} className="text-xs">
                  Vai com
                </Label>
                <Select
                  value={String(linha.indice)}
                  onValueChange={(v) => alterar(i, { indice: Number(v) })}
                >
                  <SelectTrigger id={`vai-com-${i}`} className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {equipamentos.map((a, k) => (
                      <SelectItem key={a.id} value={String(k)}>
                        {a.patrimonio}
                        {a.modelo ? ` — ${a.modelo}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => remover(i)}
              aria-label={`Remover o ${i + 1}º item que vai junto`}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={acrescentar}
            disabled={cheio}
          >
            <Plus className="size-4" />
            Acrescentar item
          </Button>
          {cheio && (
            <span className="text-muted-foreground ml-2 text-xs">
              Máximo de {MAX_ITENS_JUNTO} itens por lote.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
