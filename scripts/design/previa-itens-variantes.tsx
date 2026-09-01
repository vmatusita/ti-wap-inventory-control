// AS VARIANTES DE DESENHO DA F43 — o registro que a prévia fotografa.
//
// `atual` aponta para o COMPONENTE REAL (`src/components/itens/itens-table.tsx`)
// com a apresentação padrão. É de propósito: a mesma entrada serve para
// fotografar o ANTES (rodando o script antes de tocar no componente) e o DEPOIS
// (rodando de novo depois). O que distingue as duas fotos é a PASTA de saída, não
// uma cópia congelada do código — cópia congelada é o que diverge em silêncio.
//
// As três candidatas da fase eram o MESMO componente com uma prop de apresentação
// diferente — nada de reescrever a tabela três vezes: o que se media era uma
// decisão de apresentação, e medi-la em cópias paralelas mediria as cópias. Feita
// a escolha (ata em `docs/DECISOES.md`), a prop saiu do componente e sobrou uma
// entrada só. As fotos das três recusadas ficam em `docs/f43-evidencias/`.

import { ItensTable } from '@/components/itens/itens-table'
import type { CabecalhoDeNumero } from '@/components/itens/cabecalho-de-numero'
import type { LinhaDeItem } from '@/lib/itens/lista'
import type { MinimosPorItem } from '@/lib/itens/repor'
import type { Filial } from '@/lib/queries/filiais'

/** O contrato de props que TODA variante recebe — o mesmo de `ItensTable`. */
export type PropsDaTabela = {
  rows: LinhaDeItem[]
  filiais: Filial[]
  minimos: MinimosPorItem
  escreve: boolean
  filialPreset: number | null
  filiaisTransferencia?: readonly number[]
  cabecalhos: readonly CabecalhoDeNumero[]
}

type Variante = {
  rotulo: string
  /** O resumo em cartões aparece? A candidata `atual` da linha de base não tinha. */
  resumo: boolean
  Tabela: (props: PropsDaTabela) => React.ReactElement
}

export const VARIANTES: Record<string, Variante> = {
  atual: {
    rotulo: 'a tela como está no código agora',
    resumo: true,
    Tabela: ItensTable,
  },
}
