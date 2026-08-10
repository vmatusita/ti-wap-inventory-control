import { cn } from '@/lib/utils'
import {
  fracaoMedidor,
  nivelMedidor,
  rotuloMedidor,
  type NivelMedidor,
} from '@/lib/relatorios/medidor-minimo'

// F32/RV-09 — o micro-medidor "estoque × mínimo" sob o número da coluna Estoque.
//
// O chip "faltam N" continua onde estava: ele é o ALERTA e o rótulo em texto. O
// medidor é a graduação que faltava entre "tem de sobra" e "acabou" — o item a
// uma unidade do mínimo era visualmente idêntico ao que tem o triplo dele.
//
// Cor por CLASSE (token/paleta Tailwind com par `dark:`), nunca hex mágico: os
// mesmos três matizes que o resto do app já usa para falta/atenção/ok, e todos
// eles sobrevivem à impressão clara (o `@custom-variant dark` do globals.css
// neutraliza `dark:` no papel).
const TRILHO: Record<NivelMedidor, string> = {
  falta: 'bg-red-100 dark:bg-red-950',
  limite: 'bg-amber-100 dark:bg-amber-950',
  folga: 'bg-green-100 dark:bg-green-950',
}
const PREENCHIMENTO: Record<NivelMedidor, string> = {
  falta: 'bg-red-600 dark:bg-red-500',
  limite: 'bg-amber-600 dark:bg-amber-500',
  folga: 'bg-green-600 dark:bg-green-500',
}

export function MedidorMinimo({
  estoque,
  minimo,
}: {
  estoque: number
  minimo: number | null | undefined
}) {
  const nivel = nivelMedidor(estoque, minimo)
  // Item sem mínimo cadastrado (e todo snapshot gerado antes desta fase): a
  // célula fica exatamente como era. Não desenhar é a resposta certa — um
  // medidor sem régua pareceria estar dizendo algo sobre a reposição do item.
  if (nivel === null) return null

  const fracao = fracaoMedidor(estoque, minimo)
  const rotulo = rotuloMedidor(estoque, minimo)

  return (
    // `title` NÃO é o canal — é reforço. O canal de verdade é o `aria-label` (para
    // quem usa leitor de tela) e o chip "faltam N" ao lado (para quem lê o papel
    // em P&B, onde os três matizes viram cinzas parecidos). A régua da fase é
    // "nada novo só em hover".
    <span
      role="img"
      aria-label={rotulo ?? undefined}
      title={rotulo ?? undefined}
      className={cn(
        'mt-1 ml-auto block h-1.5 w-11 overflow-hidden rounded-full print:border print:border-foreground/40',
        TRILHO[nivel],
      )}
    >
      <span
        className={cn('block h-full rounded-full', PREENCHIMENTO[nivel])}
        style={{ width: `${Math.round(fracao * 100)}%` }}
      />
    </span>
  )
}
