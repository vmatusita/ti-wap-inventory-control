import Link from 'next/link'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// O CARTÃO DE MÉTRICA — um só, no lugar de cinco (F40).
//
// A mesma ideia (um rótulo pequeno, um número grande, às vezes clicável) estava
// escrita de cinco formas incompatíveis, e DUAS DELAS COM A ORDEM DE LEITURA
// INVERTIDA entre si:
//
//   · `relatorios/kpi-tiles.tsx` — rótulo→número, `px-3.5 py-3`, e o único dos
//     cinco SEM `tabular-nums`, justo o que serve ao dashboard e aos relatórios;
//   · `admin/importar/importar-wizard.tsx` — número→rótulo, `p-4`, `text-3xl`;
//   · `admin/fila-consolidacao.tsx` — rótulo→número, `p-3`, `text-2xl`;
//   · `relatorios/pendencias-chips.tsx` — a mesma informação como pílula;
//   · `relatorios/card-relatorio.tsx` — 49 usos, moldura paralela à do `Card`.
//
// A ORDEM DE LEITURA É RÓTULO → NÚMERO. O olho encontra primeiro o que a coisa
// é e só depois quanto ela vale; invertido, o número fica sem assunto até a
// linha seguinte. E o `tabular-nums` volta: coluna de número que dança de
// largura a cada atualização é ruído puro.
//
// A MOLDURA É A DO `Card`, como a de todo agrupamento do produto — nada de
// `rounded-lg border` escrito à mão (regra 6 de `consistencia.test.ts`).
//
// O RÓTULO É UM `<span>` `text-xs`, NÃO UM `CardTitle`: com `size="sm"` o
// `CardTitle` do kit cai para 14px por `group-data-[size=sm]/card:text-sm`, e o
// rótulo de métrica é o degrau de apoio (12px) da hierarquia — ver o plano §3.4.

/** A grade dos cartões: 2 colunas no celular, e o que a tela pedir acima. */
export function GradeDeMetricas({
  className,
  children,
}: {
  /** As colunas dos breakpoints maiores, ex.: `sm:grid-cols-3 lg:grid-cols-5`. */
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn('grid grid-cols-2 gap-3', className)}>{children}</div>
}

/** O miolo — o mesmo desenho, seja o cartão estático, link ou botão. */
function Miolo({
  rotulo,
  valor,
  apoio,
}: {
  rotulo: React.ReactNode
  valor: React.ReactNode
  apoio?: React.ReactNode
}) {
  return (
    <span className="flex flex-col gap-1">
      <span className="block text-xs text-muted-foreground">{rotulo}</span>
      <span className="block text-2xl leading-none font-semibold tabular-nums">
        {valor}
      </span>
      {apoio ? (
        <span className="block text-xs text-muted-foreground">{apoio}</span>
      ) : null}
    </span>
  )
}

/**
 * O padding que o filho clicável devolve ao cartão que o zerou.
 *
 * POR QUE O CLICÁVEL ZERA O `py` DO CARTÃO: `Card` é uma `<div>` e não dá para
 * renderizá-lo como `<a>` ou `<button>`. Se o link fosse um filho comum, a faixa
 * de padding do cartão ficaria FORA da área clicável — e um cartão de número que
 * não responde ao clique na borda parece quebrado.
 */
const RESPIRO = 'block w-full p-(--card-spacing) text-left'

/** O realce de quem pode ser clicado, e o de quem está escolhido agora. */
function clicavel(selecionado?: boolean) {
  return cn(
    'transition-colors focus-within:ring-2 focus-within:ring-ring',
    selecionado ? 'bg-accent ring-2 ring-primary' : 'hover:bg-accent/50',
  )
}

export function CartaoDeMetrica({
  rotulo,
  valor,
  apoio,
  href,
  onClick,
  selecionado,
  className,
}: {
  rotulo: React.ReactNode
  valor: React.ReactNode
  /** Uma linha de contexto abaixo do número (variação, recorte, unidade). */
  apoio?: React.ReactNode
  /** Leva a uma tela já filtrada por este balde. */
  href?: string
  /** Filtra a lista da própria tela, sem navegar. */
  onClick?: () => void
  /** Este é o balde escolhido agora? Vira `aria-pressed` no botão. */
  selecionado?: boolean
  className?: string
}) {
  if (href) {
    return (
      <Card size="sm" className={cn('py-0', clicavel(selecionado), className)}>
        <Link href={href} className={cn(RESPIRO, 'outline-none')}>
          <Miolo rotulo={rotulo} valor={valor} apoio={apoio} />
        </Link>
      </Card>
    )
  }

  if (onClick) {
    return (
      <Card size="sm" className={cn('py-0', clicavel(selecionado), className)}>
        <button
          type="button"
          aria-pressed={selecionado}
          onClick={onClick}
          className={cn(RESPIRO, 'outline-none')}
        >
          <Miolo rotulo={rotulo} valor={valor} apoio={apoio} />
        </button>
      </Card>
    )
  }

  return (
    <Card size="sm" className={className}>
      <CardContent>
        <Miolo rotulo={rotulo} valor={valor} apoio={apoio} />
      </CardContent>
    </Card>
  )
}
