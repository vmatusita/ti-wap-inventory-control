import { TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dica } from '@/components/ui/dica'
import { precisaRepor } from '@/lib/validators/item'

// Aviso "repor" do ponto de reposição (F12 · I5). Server Component, sem estado.
//
// Um componente só para as duas superfícies que pintam o aviso (a linha da tabela e
// o cartão *A repor* do resumo) usarem a MESMA regra — e para a decisão de escopo
// ficar escrita em um lugar só.
//
// ============================================================================
// ⚠ F44 — O ESCOPO MUDOU, E ISSO REVISA UMA DECISÃO DE 23/07/2026
// ============================================================================
// Até a v1.48.0 este selo comparava SEMPRE com o estoque CONSOLIDADO (todas as
// filiais), mesmo com uma filial filtrada. A decisão da F12 (I5) era explícita, e
// o motivo era bom: *"julgar pelo recorte de uma filial mandaria comprar o que está
// sobrando na filial ao lado"*.
//
// O Johnny revogou essa parte em 01/09/2026: com filtro de filial, o aviso passa a
// comparar com o estoque DAQUELE recorte. E o efeito colateral que a decisão antiga
// evitava passou a ser possível — Cerrado Alto com 1 unidade e mínimo 5 acende
// "repor" mesmo com 40 unidades em Aurora.
//
// **Por isso a dica NOMEIA o estoque que está na conta** ("estoque em Cerrado Alto:
// 1", e não "estoque de todas as filiais: 41"). O texto vem por prop, da função
// pura `rotuloEstoqueDoRepor` (`src/lib/itens/escopo.ts`), que é a mesma fonte da
// linha de escopo acima dos cartões e da `<caption>` da tabela — as três
// superfícies não têm como discordar.
//
// SEM recorte nada muda: `saldo === consolidado`, e a frase volta a ser a de antes.
//
// Âmbar de propósito: é previsão de compra, não erro. O vermelho continua sendo do
// "faltam N" (atrelados − estoque), que é compromisso já assumido — os dois podem
// aparecer na mesma linha e significam coisas diferentes.
export function BadgeRepor({
  estoqueDoRecorte,
  estoqueMinimo,
  rotuloDoEstoque,
}: {
  // `null` = a tela não sabe o estoque deste item. Nesse caso não se alerta NADA:
  // um aviso de compra sobre um número que a tela não tem é chute.
  estoqueDoRecorte: number | null
  estoqueMinimo: number
  /**
   * Contra QUAL estoque a comparação está sendo feita, por extenso — de
   * `rotuloEstoqueDoRepor`. Ex.: "estoque em Cerrado Alto",
   * "estoque de todas as filiais", "estoque somado de 3 filiais".
   */
  rotuloDoEstoque: string
}) {
  if (estoqueDoRecorte === null) return null
  if (!precisaRepor(estoqueDoRecorte, estoqueMinimo)) return null
  // F19 — o porquê do aviso (mínimo × estoque) só existia no `title=` nativo,
  // invisível para teclado e para parte dos leitores de tela (P2-10).
  // `inline-flex` no gatilho para ele abraçar a badge e continuar do mesmo
  // tamanho de antes nas duas superfícies que a usam.
  return (
    <Dica
      texto={`Abaixo do ponto de reposição — mínimo: ${estoqueMinimo.toLocaleString('pt-BR')} · ${rotuloDoEstoque}: ${estoqueDoRecorte.toLocaleString('pt-BR')}`}
      className="inline-flex"
    >
      {/* F43 — o ÍCONE entrou por medição, não por gosto. No celular, com 25
          linhas de item numa página de 3.700px, o julgamento em contexto fresco
          errou a lista duas vezes ao enumerar quem precisa de compra: uma passada
          esqueceu um selo, outra incluiu um item que não tinha nenhum. Um chip de
          texto pequeno não salta do meio de 25 linhas; com o triângulo, salta.
          A palavra não mudou — "repor" continua "repor" —, e a cor continua a
          mesma (âmbar: é previsão de compra, não erro; o vermelho continua sendo
          do "faltam N"). */}
      <Badge className="gap-1 border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <TriangleAlert className="size-3" aria-hidden />
        repor
      </Badge>
    </Dica>
  )
}
