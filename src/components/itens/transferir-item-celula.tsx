'use client'

import { ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dispararTransferirItem } from './transferir-item-evento'

// Atalho de TRANSFERÊNCIA da célula da tabela por filial (F31 · ITN-01). Client
// mínimo — a tabela continua server-rendered, como em `LancarItemLinha`.
//
// Quem decide se ele aparece é a tabela: só na célula cuja filial este cargo
// ESCREVE e que tenha estoque > 0 (não há o que transferir de uma célula zerada).
export function TransferirItemCelula({
  itemId,
  item,
  origemId,
  filial,
}: {
  itemId: number
  item: string
  origemId: number
  filial: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground"
      aria-label={`Transferir ${item} de ${filial} para outra filial`}
      title={`Transferir de ${filial}`}
      onClick={() => dispararTransferirItem({ itemId, origemId })}
    >
      <ArrowRightLeft className="size-3.5" aria-hidden />
    </Button>
  )
}
