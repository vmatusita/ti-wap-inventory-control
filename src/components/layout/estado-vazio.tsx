import Link from 'next/link'
import { Inbox, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Estado vazio padronizado (OS-F9 §1.4). Server Component, sem estado.
// `card`   = borda tracejada + icone (o padrao rico que /ativos ja usava)
// `inline` = uma linha compacta, para vazios dentro de cards do dashboard
type EstadoVazioProps = {
  titulo: string
  descricao?: string
  icone?: LucideIcon
  acao?: { href: string; rotulo: string }
  variante?: 'card' | 'inline'
  className?: string
}

export function EstadoVazio({
  titulo,
  descricao,
  icone: Icone = Inbox,
  acao,
  variante = 'card',
  className,
}: EstadoVazioProps) {
  if (variante === 'inline') {
    return (
      <div
        className={cn('flex items-center gap-2 py-2 text-sm text-muted-foreground', className)}
      >
        <Icone className="size-4 shrink-0" aria-hidden />
        <span>
          {titulo}
          {/* `text-muted-foreground` puro: a 80% o contraste cai para 3,23:1 no
              tema claro e reprova AA em texto de 14px (revisão adversarial F9). */}
          {descricao ? <span> — {descricao}</span> : null}
        </span>
        {acao ? (
          <Link
            href={acao.href}
            className="ml-auto shrink-0 rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {acao.rotulo}
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center',
        className,
      )}
    >
      <Icone className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{titulo}</p>
      {descricao ? (
        <p className="max-w-md text-sm text-muted-foreground">{descricao}</p>
      ) : null}
      {acao ? (
        <Button asChild variant="outline" className="mt-2">
          <Link href={acao.href}>{acao.rotulo}</Link>
        </Button>
      ) : null}
    </div>
  )
}
