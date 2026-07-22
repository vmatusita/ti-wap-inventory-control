'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dispararLancarItem } from './lancar-item-evento'

// Botão-ícone da linha de saldo (OS-F9 · I6): abre o dialog de lançamento já com
// item + filial preenchidos. Client mínimo — a tabela continua server-rendered.
export function LancarItemLinha({
  itemId,
  item,
  filialId,
}: {
  itemId: number
  item: string
  filialId: number | null
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10 text-muted-foreground sm:size-8"
      aria-label={`Lançar este item: ${item}`}
      title="Lançar este item"
      onClick={() => dispararLancarItem({ itemId, filialId })}
    >
      <Plus className="size-4" aria-hidden />
    </Button>
  )
}
