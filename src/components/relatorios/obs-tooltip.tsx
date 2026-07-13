'use client'

import { MessageSquare } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Observação truncada com tooltip do texto completo (OS-F3 3.3.4/3.3.5). Ícone
// 💬 discreto quando houver observação. Sem observação → travessão.
export function ObsTooltip({
  texto,
  className,
  comIcone,
}: {
  texto: string | null | undefined
  className?: string
  comIcone?: boolean
}) {
  const conteudo = texto?.trim()
  if (!conteudo) {
    return <span className={cn('text-muted-foreground', className)}>—</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'flex min-w-0 max-w-full items-center gap-1 text-muted-foreground',
            className,
          )}
        >
          {comIcone && (
            <MessageSquare className="size-3 shrink-0 opacity-60" aria-hidden />
          )}
          <span className="truncate">{conteudo}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
        {conteudo}
      </TooltipContent>
    </Tooltip>
  )
}
