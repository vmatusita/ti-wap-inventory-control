import { Dica } from '@/components/ui/dica'
import { cn } from '@/lib/utils'

// O CABEÇALHO DE UMA COLUNA DE NÚMERO (F43) — o rótulo E o que ele significa.
//
// ⚠ ISTO É O CONSERTO DO PONTO 3 DO DIAGNÓSTICO, e ele é de princípio: até a
// v1.47.2 o significado de *Total*, *Em estoque*, *Em uso* e *Falta* morava
// EXCLUSIVAMENTE dentro da `Dica` do cabeçalho. Dica é, por definição, o
// contrário de "entender ao bater o olho" — pede um gesto, espera um tempo, e no
// celular quase não existe (não há hover). A tela pedia ao operador que
// descobrisse, um por um e com o mouse parado, o que cada uma das suas quatro
// colunas queria dizer.
//
// Agora o cabeçalho tem DUAS LINHAS: o rótulo (intocado — o vocabulário está
// congelado nesta fase) e a explicação em três ou quatro palavras, VISÍVEL,
// vinda do campo `curto` de `NUMEROS_ITEM`. A `Dica` continua existindo e
// continua trazendo a explicação inteira, incluindo a fórmula da coluna Falta —
// o que mudou é que ela deixou de ser o único caminho.
//
// Fonte única preservada: rótulo, `curto` e `explicacao` saem todos do MESMO
// registro que a página de ajuda lê. Ninguém redigita vocabulário aqui.
//
// Fora do render de propósito: componente declarado DENTRO de outro é remontado a
// cada passada (regra `react-hooks/static-components`).

/** Rótulo, explicação curta e explicação inteira de um número — de `NUMEROS_ITEM`. */
export type CabecalhoDeNumero = {
  chave: string
  rotulo: string
  curto?: string
  explicacao: string
}

export function CabecalhoDeNumero({
  cabecalhos,
  chave,
  padrao,
  alinhamento = 'direita',
}: {
  cabecalhos: readonly CabecalhoDeNumero[]
  chave: string
  /** O rótulo a usar caso a chave não exista na lista — nunca deve acontecer. */
  padrao: string
  alinhamento?: 'direita' | 'esquerda'
}) {
  const meta = cabecalhos.find((c) => c.chave === chave)
  const nome = meta?.rotulo ?? padrao
  const miolo = (
    <span
      className={cn(
        'flex flex-col leading-tight',
        alinhamento === 'direita' ? 'items-end' : 'items-start',
      )}
    >
      <span>{nome}</span>
      {/* ⚠ A explicação curta SOME abaixo de `sm`, e a medição é o motivo: em
          390px a caixa da tabela tem 356px, e "na prateleira agora" + "com as
          pessoas" nos dois cabeçalhos comiam 194px deles — sobravam 91px para o
          nome do item, que passava a quebrar em oito linhas. No celular a
          explicação custaria justamente a legibilidade que ela existe para dar.
          Os rótulos continuam inteiros, e a `Dica` continua alcançável por
          toque. */}
      {meta?.curto ? (
        <span className="hidden text-xs font-normal text-muted-foreground sm:block">
          {meta.curto}
        </span>
      ) : null}
    </span>
  )
  return meta?.explicacao ? (
    <Dica texto={meta.explicacao} className="inline-flex">
      {miolo}
    </Dica>
  ) : (
    miolo
  )
}
