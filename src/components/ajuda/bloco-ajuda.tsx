import { Lightbulb } from 'lucide-react'
import { StatusBadge } from '@/components/ativos/status-badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  pillTipo,
  pillTipoLancamento,
  type StatusAtivo,
  type TipoLancamento,
} from '@/lib/dominio'
import type { Bloco, Verbete } from '@/lib/ajuda/conteudo'

// Renderiza UM bloco do manual (server component — puro). Os badges do glossario
// sao os componentes REAIS do sistema (StatusBadge, pilulas de dominio.ts), para
// o operador ver no manual exatamente a cor/rotulo que ve nas telas.

function BadgeVerbete({
  badge,
  v,
}: {
  badge: 'status' | 'tipoLanc' | 'termo' | 'neutro'
  v: Verbete
}) {
  if (badge === 'status') {
    return <StatusBadge status={v.chave as StatusAtivo} />
  }
  if (badge === 'tipoLanc') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
          pillTipoLancamento(v.chave as TipoLancamento),
        )}
      >
        {v.rotulo}
      </span>
    )
  }
  return (
    <Badge variant="outline" className="font-medium">
      {v.rotulo}
    </Badge>
  )
}

export function BlocoAjuda({ bloco }: { bloco: Bloco }) {
  switch (bloco.tipo) {
    case 'paragrafo':
      return <p className="text-sm leading-relaxed text-muted-foreground">{bloco.texto}</p>

    case 'nota':
      return (
        <div className="flex gap-2 rounded-lg border border-brand-amarelo/40 bg-brand-amarelo/5 p-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-amarelo" aria-hidden />
          <p className="text-sm leading-relaxed text-foreground/90">{bloco.texto}</p>
        </div>
      )

    case 'lista':
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {bloco.itens.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )

    case 'passos':
      return (
        <div className="space-y-2">
          {bloco.titulo && (
            <h3 className="text-sm font-semibold text-foreground">{bloco.titulo}</h3>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {bloco.itens.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ol>
        </div>
      )

    case 'glossario':
      return (
        <dl className="space-y-3">
          {bloco.itens.map((v) => (
            <div
              key={v.chave}
              className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <dt className="sm:w-44 sm:shrink-0">
                <BadgeVerbete badge={bloco.badge} v={v} />
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{v.descricao}</dd>
            </div>
          ))}
        </dl>
      )

    case 'movimentacoes':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {bloco.itens.map((v) => (
            <div key={v.chave} className="rounded-lg border bg-card p-3">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  pillTipo(v.chave),
                )}
              >
                {v.rotulo}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.efeito}</p>
              {v.campos.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Pede:{' '}
                  {v.campos
                    .map((c) => `${c.rotulo}${c.obrigatorio ? '*' : ''}`)
                    .join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )
  }
}
