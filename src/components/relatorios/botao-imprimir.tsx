'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Impressão limpa via navegador (OS-F3 3.5.2). O CSS @media print esconde o
// chrome e põe os cards em coluna única.
export function BotaoImprimir() {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Imprimir"
      className="h-9 gap-1.5 sm:h-7 print:hidden"
      onClick={() => window.print()}
    >
      <Printer className="size-4" />
      <span className="hidden sm:inline">Imprimir</span>
    </Button>
  )
}
