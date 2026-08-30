import { cn } from '@/lib/utils'

// O AVISO — a faixa curta que diz o que deu errado ou o que exige atenção (F40).
//
// O inventário mediu OITO anatomias e nenhum componente. A caixa VERMELHA
// aparecia em 12 sítios com 4 medidas (`rounded-lg …/40 p-3 text-sm
// text-destructive` · `rounded-md …/40 p-3` · `rounded-lg …/50 p-3` SEM
// `text-destructive` · `… p-4` sem `text-sm`). A caixa ÂMBAR aparecia em 23
// sítios, com 6 medidas e 4 bordas diferentes. E havia uma assimetria de 8:1
// entre `role="alert"` (39 usos) e `aria-live` (5): quase tudo interrompia a
// leitura, inclusive o que só informava.
//
// A INTENÇÃO ESCOLHE A COR **E** O PAPEL DE ACESSIBILIDADE, juntos — é o par que
// importa, e é o que corrige a assimetria de passagem. Erro interrompe
// (`role="alert"`, o leitor de tela fala na hora); atenção informa
// (`role="status"`, fala quando puder); informação não anuncia nada.
//
// A COR NUNCA É O ÚNICO SINAL: o texto de cada aviso já diz o que aconteceu, e
// as três intenções também se separam pelo tom da borda.

export type IntencaoDoAviso = 'erro' | 'atencao' | 'informacao'

/**
 * A tinta de cada intenção.
 *
 * O ÂMBAR É `text-warning`, NUNCA `text-warning-foreground`, e isto é medido: o
 * `-foreground` é quase branco no tema claro (`globals.css`) e dá **1,10:1**
 * sobre `bg-warning/10`, enquanto `text-warning` dá **4,92:1`. É o par que
 * `ui/badge.tsx` já usa e o que o comentário do próprio token documenta.
 *
 * Os dois tokens (`--destructive` e `--warning`) CLAREIAM SOZINHOS no `.dark` —
 * daí não haver nenhuma variante `dark:` aqui, ao contrário das ~30 caixas à mão
 * que este componente substitui, todas com `dark:border-amber-900` repetido.
 */
const TOM: Record<IntencaoDoAviso, string> = {
  erro: 'border-destructive/40 bg-destructive/5 text-destructive',
  atencao: 'border-warning/40 bg-warning/10 text-warning',
  // Sem tinta própria: a borda é a `border-border` padrão que a caixa já traz.
  informacao: 'bg-muted/50',
}

/** Erro interrompe; atenção informa; informação não anuncia. */
const PAPEL: Record<IntencaoDoAviso, 'alert' | 'status' | undefined> = {
  erro: 'alert',
  atencao: 'status',
  informacao: undefined,
}

export function Aviso({
  intencao = 'erro',
  icone,
  className,
  ref,
  children,
}: {
  intencao?: IntencaoDoAviso
  /** O glifo da esquerda. Decorativo — quem carrega o sentido é o texto. */
  icone?: React.ReactNode
  className?: string
  /**
   * Para rolar até o aviso. Formulário longo que falha no envio precisa levar a
   * pessoa ao motivo. No React 19 `ref` é prop comum de componente de função —
   * não precisa de `forwardRef`.
   */
  ref?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}) {
  return (
    <div
      ref={ref}
      role={PAPEL[intencao]}
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-sm',
        TOM[intencao],
        className,
      )}
    >
      {icone ? <span className="mt-0.5 shrink-0">{icone}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
