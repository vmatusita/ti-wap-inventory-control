// AS VARIANTES DE DESENHO DA F43 — o registro que a prévia fotografa.
//
// `atual` aponta para o COMPONENTE REAL (`src/components/itens/itens-table.tsx`).
// É de propósito: a mesma entrada serve para fotografar o ANTES (rodando o script
// antes de tocar no componente) e o DEPOIS (rodando de novo depois). O que
// distingue as duas fotos é a PASTA de saída, não uma cópia congelada do código —
// cópia congelada é exatamente o que diverge em silêncio.
//
// As demais entradas são candidatas de desenho, vivas só enquanto a fase escolhe
// uma por evidência. A escolhida é PROMOVIDA para `src/components/itens/` e
// re-fotografada por `atual`; as recusadas ficam registradas em
// `docs/DECISOES.md` e saem daqui.

import { ItensTable } from '@/components/itens/itens-table'
import type { CabecalhoDeNumero } from '@/components/itens/itens-table'
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

export const VARIANTES: Record<
  string,
  { rotulo: string; Tabela: (props: PropsDaTabela) => React.ReactElement }
> = {
  atual: {
    rotulo: 'a tela como está no código agora',
    Tabela: ItensTable,
  },
}
