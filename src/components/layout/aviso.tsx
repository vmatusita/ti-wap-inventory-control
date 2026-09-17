import { Card } from '@/components/ui/card'
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
//
// ⚠ A MOLDURA VEM DO `Card`, e é a mesma receita do `QuadroDeTabela` — correção
// da revisão de 31/08/2026. Até aqui este componente desenhava a própria caixa
// com `rounded-lg border`: 8px de raio contra os 12px do `Card`, dentro do
// componente que a fase criou justamente para acabar com "quatro raios e três
// traços para o mesmo objeto". Ele escapava da regra 6 de
// `src/lib/layout/consistencia.test.ts` só por estar na lista `SISTEMA`, que é
// isenta — e a divergência apareceria na primeira tela da frente **a** que
// pusesse um aviso âmbar ao lado de um cartão.
//
// OS TRÊS AJUSTES NO `Card`, e os três existem para NÃO REPINTAR nada:
// · `border ring-0` — o kit desenha o traço com `ring-1 ring-foreground/10`, e a
//   cor da borda deste componente é a da INTENÇÃO (`border-destructive/40`,
//   `border-warning/40`, ou a `border-border` padrão). O anel neutro do kit
//   apagaria essa distinção.
// · `bg-transparent` — o aviso é uma FAIXA, não uma superfície. O `Card` traz
//   `bg-card`, e no tema escuro `--card` é `oklch(0.205)` contra `oklch(0.145)`
//   do `--background`: um aviso de erro posto direto na página ganharia um fundo
//   que ele não tem hoje. Com `bg-transparent` a intenção `erro` continua SEM
//   VÉU — que é a medição do bloco abaixo, e a razão de ela passar por 4,76:1.
//   As intenções `atencao` e `informacao` põem o fundo delas DEPOIS, no `TOM`, e
//   o `cn()` (tailwind-merge) deixa o último vencer.
// · `p-3` sozinho, NUNCA `p-3 py-0` — o `p-3` já apaga o `py-(--card-spacing)`
//   do kit; o `py-0` escrito depois zeraria o respiro vertical. Foi o defeito
//   que a revisão adversarial da F40 pegou em nove cartões do piloto, e a regra
//   4b do teste de consistência existe por causa dele.
//
// `text-card-foreground` vem junto e não muda nada: `--card-foreground` e
// `--foreground` são o MESMO valor nos dois temas (`globals.css:95/97` e
// `242/245`). Nenhuma das seis razões medidas em `npm run contraste` se move.

// F61 — A QUARTA INTENÇÃO, `sucesso`. A conversão de `components/admin/` para a régua
// achou duas caixas VERDES escritas à mão (o "tudo certo" do import e o "senha
// confere" do teste de senha), e o componente não tinha para onde levá-las. A tinta
// é o par `--sucesso`/`--sucesso-texto` (`globals.css`, medido 6,45:1 no claro), sem
// variante `dark:` — o token troca sozinho no `.dark`, como os outros. O papel é
// `status`: sucesso informa, não interrompe.
export type IntencaoDoAviso = 'erro' | 'atencao' | 'informacao' | 'sucesso'

/**
 * A tinta de cada intenção — TODA MEDIDA antes de ser escrita
 * (`node scripts/contraste.mjs --par "<texto> sobre <fundo>"`).
 *
 * O ÂMBAR É `text-warning`, NUNCA `text-warning-foreground`: o `-foreground` é
 * quase branco no tema claro e dá **1,10:1** sobre `bg-warning/10`, enquanto
 * `text-warning` dá **4,92:1** (claro) e **7,86:1** (escuro). É o par que
 * `ui/badge.tsx` já usa e o que o comentário do próprio token documenta.
 *
 * ⚠ O ERRO NÃO TEM FUNDO, e a ausência é MEDIDA, não descuido. O rascunho deste
 * componente (plano §3.6) trazia `bg-destructive/5`, e a régua reprovou: o
 * `text-destructive` sobre esse véu dá **4,36:1** no tema claro — abaixo do piso
 * de 4,5:1. Com `/10` piora para 3,99:1 (é o mesmo defeito que a F28 já tinha
 * corrigido na mesa de conflitos). Sem véu nenhum, sobre o card, dá **4,76:1** e
 * passa. Também é o que as 12 caixas vermelhas do produto já renderizam hoje —
 * então consolidar não repinta nenhuma delas.
 *
 * A informação usa `bg-muted/50`: `muted-foreground` sobre ele mede 4,53:1
 * (claro) e 6,39:1 (escuro).
 *
 * Os dois tokens (`--destructive` e `--warning`) CLAREIAM SOZINHOS no `.dark` —
 * daí não haver nenhuma variante `dark:` aqui, ao contrário das ~30 caixas à mão
 * que este componente substitui, todas com `dark:border-amber-900` repetido.
 */
const TOM: Record<IntencaoDoAviso, string> = {
  erro: 'border-destructive/40 text-destructive',
  atencao: 'border-warning/40 bg-warning/10 text-warning',
  // Sem tinta própria: a borda é a `border-border` padrão que a caixa já traz.
  informacao: 'bg-muted/50',
  sucesso: 'border-sucesso-texto/40 bg-sucesso text-sucesso-texto',
}

/** Erro interrompe; atenção e sucesso informam; informação não anuncia. */
const PAPEL: Record<IntencaoDoAviso, 'alert' | 'status' | undefined> = {
  erro: 'alert',
  atencao: 'status',
  informacao: undefined,
  sucesso: 'status',
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
    <Card
      ref={ref}
      role={PAPEL[intencao]}
      className={cn(
        // `flex-row` porque o `Card` do kit é `flex-col`; `gap-2` vence o
        // `gap-(--card-spacing)` dele pelo tailwind-merge.
        'flex flex-row items-start gap-2 border bg-transparent p-3 text-sm ring-0',
        TOM[intencao],
        className,
      )}
    >
      {icone ? <span className="mt-0.5 shrink-0">{icone}</span> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  )
}
