import Link from 'next/link'
import { Inbox, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Estado vazio padronizado (OS-F9 §1.4). Server Component, sem estado.
// `card`   = borda tracejada + icone (o padrao rico que /ativos ja usava)
// `inline` = uma linha compacta, para vazios dentro de cards do dashboard
//
// ESTA É A ÚNICA BORDA TRACEJADA LEGÍTIMA DO PRODUTO. O inventário da F40 achou
// 23 strings com `border-dashed` escritas à mão FORA daqui, em 10 geometrias
// diferentes (`py-16`, `py-12`, `py-10`, `p-8`, `p-6`, `py-8`, `py-6`, `p-3`,
// `p-2.5`, `px-3 py-2`), mais 8 vazios sem moldura nenhuma e 3 `<p>` soltos — e a
// cópia mais literal repetia a string exata da linha 53 deste arquivo, sem
// importar o componente. A regra 6 de `src/lib/layout/consistencia.test.ts` abre
// exceção para `border-dashed` justamente porque ela é ISTO AQUI.
//
// F40 — `acao` PASSOU A ACEITAR `ReactNode`. Vários dos 23 vazios à mão precisam
// DISPARAR UM DIÁLOGO, não navegar, e era daí que vinha parte da divergência:
// quem precisava de um botão não conseguia usar o componente. A assinatura antiga
// (`{ href, rotulo }`) continua válida e nenhum dos 12 usos atuais muda.
type AcaoDeLink = { href: string; rotulo: string }

type EstadoVazioProps = {
  titulo: string
  descricao?: React.ReactNode
  icone?: LucideIcon
  acao?: AcaoDeLink | React.ReactNode
  variante?: 'card' | 'inline'
  className?: string
}

/**
 * É a forma antiga (`{ href, rotulo }`) ou um nó do React?
 *
 * A discriminação é por PROPRIEDADE e não por `typeof`: um elemento React também
 * é `object`. Exige as duas chaves como string, que é como os 12 chamadores de
 * hoje montam o objeto — nenhum passa `href` sem `rotulo`.
 */
function ehAcaoDeLink(acao: AcaoDeLink | React.ReactNode): acao is AcaoDeLink {
  return (
    typeof acao === 'object' &&
    acao !== null &&
    !Array.isArray(acao) &&
    typeof (acao as AcaoDeLink).href === 'string' &&
    typeof (acao as AcaoDeLink).rotulo === 'string'
  )
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
        {ehAcaoDeLink(acao) ? (
          <Link
            href={acao.href}
            className="ml-auto shrink-0 rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {acao.rotulo}
          </Link>
        ) : acao ? (
          <span className="ml-auto shrink-0">{acao}</span>
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
      {ehAcaoDeLink(acao) ? (
        <Button asChild variant="outline" className="mt-2">
          <Link href={acao.href}>{acao.rotulo}</Link>
        </Button>
      ) : acao ? (
        <div className="mt-2">{acao}</div>
      ) : null}
    </div>
  )
}
