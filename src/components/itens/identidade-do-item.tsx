import { BadgeRepor } from '@/components/itens/badge-repor'
import { GRUPO_ITEM_META } from '@/lib/dominio'
import type { GrupoItem } from '@/lib/dominio'

// O BLOCO DE IDENTIDADE DA LINHA (F43) — quem é este item, em duas linhas.
//
// ANTES desta fase, "quem é o item" estava espalhado por TRÊS células: o nome, a
// coluna **Grupo** (`hidden md:table-cell`) e a coluna **Tipo**
// (`hidden lg:table-cell`). Duas consequências medidas na tela de 01/09/2026:
//
//  1. **No celular a classificação simplesmente não existia.** Abaixo de 768px o
//     grupo sumia; abaixo de 1024px, o tipo. E a foto de 390px mostrou algo pior:
//     a tabela pedia 740px numa caixa de 356px, então nem os NÚMEROS apareciam.
//  2. **No desktop, a coluna Grupo repetia "Acessórios e periféricos" 24 vezes
//     seguidas** — 140px de largura gastos com a informação de menor variação da
//     tela inteira (o vocabulário tem DOIS valores), justo a largura que faltava
//     para a distribuição por filial caber na linha.
//
// Juntando as três células numa só, a classificação passa a aparecer em TODA
// largura (ganho, não perda) e a tabela recupera a largura de duas colunas.
//
// ⚠ O RÓTULO CURTO, e por que ele não é mudança de vocabulário: `GRUPO_ITEM_META`
// já tem os dois textos — `titulo` ("Acessórios e periféricos", que titulava a
// SEÇÃO quando a tela tinha um bloco por grupo) e `rotulo` ("Acessório"), que é o
// que `rotuloGrupoItem()` devolve e o que o resto do produto usa para se referir a
// UM item. Aqui a frase é sobre um item, então o texto é o do item. Nenhuma
// palavra nova foi inventada.
//
// Server Component: sem estado, sem evento. É chamado de dentro da tabela (que é
// client) como qualquer outro componente puro de apresentação.
export function IdentidadeDoItem({
  item,
  grupo,
  tipoRotulo,
  estoqueConsolidado,
  estoqueMinimo,
}: {
  item: string
  grupo: GrupoItem
  /** O rótulo de `tipos_item` (F37), ou `null` — o catálogo antigo nasceu sem tipo. */
  tipoRotulo: string | null
  /** Sempre o CONSOLIDADO — a regra do "repor" (Johnny, 22/07/2026). */
  estoqueConsolidado: number | null
  estoqueMinimo: number
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5 font-medium">
        {item}
        {/* "repor" fica junto do NOME desde a F12, e continua: é o alarme que
            responde "o que eu preciso comprar?" — a primeira pergunta da tela. */}
        <BadgeRepor estoqueConsolidado={estoqueConsolidado} estoqueMinimo={estoqueMinimo} />
      </span>
      <span className="text-xs text-muted-foreground">
        {GRUPO_ITEM_META[grupo].rotulo}
        {tipoRotulo ? ` · ${tipoRotulo}` : ''}
      </span>
    </span>
  )
}
