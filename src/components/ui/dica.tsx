'use client'

import type { ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// F19 — dica de conteúdo que antes vivia só no `title=` nativo (P2-10): aquele
// atributo não abre por foco de teclado e parte dos leitores de tela o ignora,
// então a informação simplesmente não existia para quem não usa mouse.
//
// Componente client MÍNIMO de propósito: as tabelas que consomem isto
// (saldos-filiais, celulas, badge-repor) são Server Components e precisam
// continuar sendo — só este trecho cruza a fronteira, como já faz o
// `relatorios/obs-tooltip.tsx`, que é o precedente deste formato.
//
// O gatilho é um `<span tabIndex={0}>` (e não o botão padrão do Radix): estes
// pontos envolvem número/badge dentro de célula de tabela, onde um `<button>`
// traria estilo e semântica de ação que não existe. Quem chama passa em
// `className` o layout que o elemento substituído tinha.
export function Dica({
  texto,
  children,
  className,
}: {
  texto: string
  children: ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
        {texto}
      </TooltipContent>
    </Tooltip>
  )
}
