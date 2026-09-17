import { identidadeDoSistema } from '@/lib/identidade/sistema'
import { cn } from '@/lib/utils'

// Lockup da marca (chip amarelo com a sigla + nome do sistema). Fonte única —
// antes esse markup estava copiado à mão no header do app, no header do
// visualizador e nas 3 telas de autenticação (login, definir senha, acesso por
// senha). O texto do NOME herda a cor do contexto (o texto do cromo no header
// escuro, foreground no sheet claro); passe `labelClassName` quando precisar
// fixar (ex.: `text-brand-dark-texto` sobre o painel escuro das telas de auth) ou
// esconder no mobile.
//
// F61 — OS PONTOS DE INJEÇÃO. A sigla e o nome eram texto no JSX (`WAP`,
// `'Estoque TI'`); agora chegam por PROP, com o padrão lido da fonte única
// (`src/lib/identidade/sistema.ts`) — é por aqui que a F70 passa a identidade da
// empresa, descendo do `contextoDoApp()`. E o chip usa o PAR de tokens
// (`bg-brand-amarelo` + `text-brand-amarelo-texto`), não `text-black` cru: trocar a
// cor da marca passa a ser trocar um par medido por `scripts/contraste.mjs`, não
// caçar a classe. Valores idênticos aos de antes — nenhum pixel muda.
export function Marca({
  sigla,
  label,
  size = 'sm',
  labelClassName,
}: {
  /** A sigla do chip. Padrão: a da fonte única. */
  sigla?: string
  /** O nome ao lado do chip. Padrão: o nome do sistema na fonte única. */
  label?: string
  // 'sm' = header (chip text-xs, nome text-sm); 'lg' = telas de auth (maior).
  size?: 'sm' | 'lg'
  labelClassName?: string
}) {
  const identidade = identidadeDoSistema()
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={cn(
          'rounded bg-brand-amarelo px-2 py-1 font-bold tracking-tight text-brand-amarelo-texto',
          size === 'lg' ? 'text-sm' : 'text-xs',
        )}
      >
        {sigla ?? identidade.sigla}
      </span>
      <span
        className={cn(
          'font-semibold',
          size === 'lg' ? 'text-lg' : 'text-sm',
          labelClassName,
        )}
      >
        {label ?? identidade.nome}
      </span>
    </div>
  )
}
