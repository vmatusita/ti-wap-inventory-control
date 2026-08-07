import { cn } from '@/lib/utils'

// Card padrão dos relatórios (grade do mockup). `wide` ocupa a linha inteira.
// Todo card trata estado vazio ("Sem registros no período") — OS-F3 3.3.7.
export function CardRelatorio({
  id,
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
  /** F29/REL-09a — alvo de âncora (`#resumo`). Só quem tem chip na barra sticky
   *  passa; sem `id` o card é exatamente o de antes. */
  id?: string
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
      id={id}
      className={cn(
        // `scroll-mt-28` só quando o card é alvo de âncora: 112px é a pilha sticky
        // do celular (header 56px + a barra de chips), a mesma medida das seções.
        id && 'scroll-mt-28',
        // `min-w-0`: item de grid tem `min-width:auto`, que resolve para o
        // min-content do conteúdo. Com as tabelas de item (`th/td` em
        // `whitespace-nowrap`) isso inflava a trilha `1fr` para além do
        // contêiner e o DOCUMENTO ganhava scroll horizontal (F13/B4-R2). Com
        // min-w-0 a trilha volta a caber e a rolagem cai no contêiner certo — o
        // `overflow-x-auto` que a própria Table já tem.
        'min-w-0 rounded-xl border bg-card p-4 md:p-5',
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
