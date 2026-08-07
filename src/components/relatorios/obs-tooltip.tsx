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
          {/* REL-13a — o tooltip só existe no hover, que não existe no papel, e o
              relatório impresso é o substituto do e-mail arquivável: a observação
              precisa sair COMPLETA. Na mídia print o clamp do `truncate`
              (nowrap + overflow hidden) é desfeito e o texto quebra em linhas
              dentro da própria largura da coluna. Vale para TODOS os consumidores
              do componente — as células do relatório, a tabela de saldo por item,
              a lista de manutenção, a lista de movimentações e o histórico de
              lançamentos —, que tinham o mesmo defeito. */}
          <span className="truncate print:overflow-visible print:whitespace-normal print:break-words">
            {conteudo}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
        {conteudo}
      </TooltipContent>
    </Tooltip>
  )
}
