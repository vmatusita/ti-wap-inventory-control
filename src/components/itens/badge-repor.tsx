import { Badge } from '@/components/ui/badge'
import { Dica } from '@/components/ui/dica'
import { precisaRepor } from '@/lib/validators/item'

// Aviso "repor" do ponto de reposição (F12 · I5). Server Component, sem estado.
//
// Um componente só para as DUAS visões de /itens (consolidada e por filial)
// pintarem o MESMO aviso pela MESMA regra — e para a decisão "o mínimo compara
// com o consolidado, nunca com o saldo de uma filial" (Johnny, 22/07/2026) ficar
// escrita em um lugar só. Quem chama passa sempre o estoque CONSOLIDADO.
//
// Âmbar de propósito: é previsão de compra, não erro. O vermelho continua sendo
// do "faltam N" (atrelados − estoque), que é compromisso já assumido — os dois
// podem aparecer na mesma linha e significam coisas diferentes.
export function BadgeRepor({
  estoqueConsolidado,
  estoqueMinimo,
}: {
  // `null` = a tela não sabe o consolidado deste item (só aconteceria se a
  // leitura consolidada não o conhecesse). Nesse caso não se alerta NADA — bem
  // melhor do que julgar pelo saldo parcial de uma filial e mandar comprar o que
  // está sobrando na filial ao lado.
  estoqueConsolidado: number | null
  estoqueMinimo: number
}) {
  if (estoqueConsolidado === null) return null
  if (!precisaRepor(estoqueConsolidado, estoqueMinimo)) return null
  // F19 — o porquê do aviso (mínimo × consolidado) só existia no `title=`
  // nativo, invisível para teclado e para parte dos leitores de tela (P2-10).
  // `inline-flex` no gatilho para ele abraçar a badge e continuar do mesmo
  // tamanho de antes nos dois lugares que a usam (tabela consolidada e por filial).
  return (
    <Dica
      texto={`Abaixo do ponto de reposição — mínimo: ${estoqueMinimo.toLocaleString('pt-BR')} · estoque de todas as filiais: ${estoqueConsolidado.toLocaleString('pt-BR')}`}
      className="inline-flex"
    >
      <Badge className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        repor
      </Badge>
    </Dica>
  )
}
