import { cn } from '@/lib/utils'

// Card padrão dos relatórios (grade do mockup). `wide` ocupa a linha inteira.
// Todo card trata estado vazio ("Sem registros no período") — OS-F3 3.3.7.
export function CardRelatorio({
  titulo,
  subtitulo,
  acao,
  wide,
  vazio,
  vazioMsg = 'Sem registros no período.',
  className,
  contentClassName,
  children,
}: {
  titulo: string
  subtitulo?: string
  acao?: React.ReactNode
  wide?: boolean
  vazio?: boolean
  vazioMsg?: string
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-xl border bg-card p-4 md:p-5',
        wide && 'md:col-span-2',
        'break-inside-avoid',
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{titulo}</h2>
          {subtitulo && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>
          )}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>

      {vazio ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{vazioMsg}</p>
      ) : (
        <div className={contentClassName}>{children}</div>
      )}
    </section>
  )
}
