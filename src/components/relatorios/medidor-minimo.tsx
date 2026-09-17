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
  // F61 — a folga tem token PRÓPRIO: o verde aqui significa "estoque bem acima do
  // mínimo", não "em estoque" nem "deu certo". Mesmos valores de antes.
  folga: 'bg-medidor-folga',
}
const PREENCHIMENTO: Record<NivelMedidor, string> = {
  falta: 'bg-red-600 dark:bg-red-500',
  limite: 'bg-amber-600 dark:bg-amber-500',
  folga: 'bg-medidor-folga-barra',
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
    <span className="mt-1 flex items-center justify-end gap-1">
      {/* F32 — achado da revisão adversarial: 'limite' e 'folga' desenhavam a
          MESMA barra cheia (o preenchimento satura em 100% assim que o estoque
          alcança o mínimo), diferindo só pelo matiz — e âmbar-600 e verde-600
          têm luminância quase igual, então em P&B, no papel, os dois viravam o
          mesmo cinza. Quem só olha (sem mouse para o `title`, sem leitor de
          tela) não conseguia separar "precisa repor logo" de "tem de sobra".
          O rótulo abaixo é esse canal, em TEXTO e permanente.
          Só o 'limite' o recebe: 'falta' já tem o chip vermelho "faltam N" na
          coluna ao lado, e 'folga' não é alerta — anunciar os três encheria a
          tabela de ruído justamente onde não há nada a fazer. */}
      {nivel === 'limite' && (
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          no limite
        </span>
      )}
      {/* `title` NÃO é o canal — é reforço. O canal de verdade é o `aria-label`
          (leitor de tela) e o texto ao lado. A régua da fase é "nada novo só em
          hover"; a borda no `print:` mantém o medidor visível quando a cor de
          fundo não é impressa. */}
      <span
        role="img"
        aria-label={rotulo ?? undefined}
        title={rotulo ?? undefined}
        className={cn(
          'block h-1.5 w-11 shrink-0 overflow-hidden rounded-full print:border print:border-foreground/40',
          TRILHO[nivel],
        )}
      >
        <span
          className={cn('block h-full rounded-full', PREENCHIMENTO[nivel])}
          style={{ width: `${Math.round(fracao * 100)}%` }}
        />
      </span>
    </span>
  )
}
