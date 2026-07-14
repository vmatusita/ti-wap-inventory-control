import { cn } from '@/lib/utils'

// Lockup da marca WAP (chip amarelo "WAP" + nome do sistema). Fonte única —
// antes esse markup estava copiado à mão no header do app, no header do
// visualizador e nas 3 telas de autenticação (login, definir senha, acesso por
// senha). O texto herda a cor do contexto (branco no chrome escuro, foreground
// no sheet claro); passe `labelClassName` quando precisar fixar (ex.: text-white
// sobre o painel escuro das telas de auth) ou esconder no mobile.
export function Marca({
  label = 'Estoque TI',
  size = 'sm',
  labelClassName,
}: {
  label?: string
  // 'sm' = header (chip text-xs, nome text-sm); 'lg' = telas de auth (maior).
  size?: 'sm' | 'lg'
  labelClassName?: string
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={cn(
          'rounded bg-brand-amarelo px-2 py-1 font-bold tracking-tight text-black',
          size === 'lg' ? 'text-sm' : 'text-xs',
        )}
      >
        WAP
      </span>
      <span
        className={cn(
          'font-semibold',
          size === 'lg' ? 'text-lg' : 'text-sm',
          labelClassName,
        )}
      >
        {label}
      </span>
    </div>
  )
}
