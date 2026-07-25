import Link from 'next/link'
import { ArrowRight, Lightbulb } from 'lucide-react'
import { StatusBadge } from '@/components/ativos/status-badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  pillTipo,
  pillTipoLancamento,
  type StatusAtivo,
  type TipoLancamento,
} from '@/lib/dominio'
import { paginaPorSlug } from '@/lib/ajuda/registry'
import type { Bloco, Verbete } from '@/lib/ajuda/tipos'

// Renderiza UM bloco da documentacao (server component — puro). Os badges do
// glossario sao os componentes REAIS do sistema (StatusBadge, pilulas de
// dominio.ts), para o operador ver na documentacao exatamente a cor/rotulo que
// ve nas telas.

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

// `contexto` acerta a hierarquia de titulos (e as ancoras) nos dois lugares que
// renderizam os mesmos blocos:
//  - 'pagina' (/ajuda/<slug>): h1 e o titulo da pagina -> 'titulo' vira h2 COM id
//    (e o alvo do sumario e do "?" contextual) e o titulo de 'passos' vira h3.
//  - 'manual' (/ajuda/manual): a pagina ja e um h3 dentro da categoria -> desce
//    um nivel, MAS mantem o id. O medo do id repetido no documento agregado nao
//    se realiza: `registry.test.ts` exige que as ancoras sejam unicas no
//    documento INTEIRO, justamente porque o manual agrega todas. Omitir o id
//    so custava — nenhum trecho do manual era enderecavel (achado da revisao
//    dos 8 commits da F20).
export function BlocoAjuda({
  bloco,
  contexto = 'pagina',
}: {
  bloco: Bloco
  contexto?: 'pagina' | 'manual'
}) {
  const noManual = contexto === 'manual'

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

    // Subtítulo com âncora: alimenta o sumário da página e o link direto
    // /ajuda/<slug>#<id>. `scroll-mt` acompanha o cabeçalho fixo, como as
    // seções da ajuda de página única faziam (F13-B3).
    case 'titulo': {
      const classe = 'scroll-mt-24 pt-2 text-base font-semibold tracking-tight text-foreground'
      return noManual ? (
        <h4 id={bloco.id} className={classe}>
          {bloco.texto}
        </h4>
      ) : (
        <h2 id={bloco.id} className={classe}>
          {bloco.texto}
        </h2>
      )
    }

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
          {bloco.titulo &&
            (noManual ? (
              <h5 className="text-sm font-semibold text-foreground">{bloco.titulo}</h5>
            ) : (
              <h3 className="text-sm font-semibold text-foreground">{bloco.titulo}</h3>
            ))}
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
                  pillTipo(v.chave as Parameters<typeof pillTipo>[0]),
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

    // Tabela sempre dentro do próprio contêiner rolável: no celular a página
    // nunca ganha rolagem lateral (invariante desde a F13).
    case 'tabela':
      return (
        <div className="space-y-1">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  {bloco.colunas.map((c, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="py-2 pr-4 text-left font-semibold text-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bloco.linhas.map((linha, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {linha.map((celula, j) => (
                      <td
                        key={j}
                        className={cn(
                          'py-2 pr-4 align-top leading-relaxed',
                          j === 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {celula}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bloco.legenda && (
            <p className="text-xs text-muted-foreground">{bloco.legenda}</p>
          )}
        </div>
      )

    case 'atalhos':
      return (
        <dl className="space-y-2">
          {bloco.itens.map((a, i) => (
            <div key={i} className="flex flex-col gap-1 sm:flex-row sm:gap-4">
              <dt className="sm:w-40 sm:shrink-0">
                <kbd className="inline-flex items-center rounded border bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                  {a.teclas}
                </kbd>
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                {a.acao}
                {a.observacao && (
                  <span className="block text-xs text-muted-foreground/80">{a.observacao}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )

    case 'sintomas':
      return (
        <div className="space-y-3">
          {bloco.itens.map((s, i) => (
            <div key={i} className="rounded-lg border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">{s.sintoma}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground/80">Por quê: </span>
                {s.causa}
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {s.saida.map((passo, j) => (
                  <li key={j}>{passo}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )

    // O rótulo padrão é o TÍTULO da página de destino — derivado do registry,
    // nunca copiado: renomear uma página renomeia todos os links para ela.
    case 'links':
      return (
        <nav aria-label="Leia também" className="space-y-1 print:hidden">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Leia também
          </p>
          <ul className="space-y-1">
            {bloco.itens.map((r, i) => {
              const destino = paginaPorSlug(r.slug)
              if (!destino) return null
              const href = `/ajuda/${r.slug}${r.ancora ? `#${r.ancora}` : ''}`
              return (
                <li key={i}>
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1.5 text-sm text-foreground underline-offset-4 hover:text-brand-amarelo hover:underline"
                  >
                    <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                    {r.texto ?? destino.titulo}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )
  }
}
