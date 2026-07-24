// Marcação de estorno das linhas das tabelas detalhadas (F16/T1). Puro e testado.
//
// Nem `movimentacoes` nem `lancamentos_item` têm coluna "estornada": o estorno é
// SEMPRE inferido pela existência de OUTRA linha apontando para a original
// (`movimentacoes.tipo='estorno'` + `estorno_de`; `lancamentos_item.estorna_id`).
// Os builders (queries/relatorios/movimentacoes.ts e itens.ts) montam um
// `Map<idOriginal, dataDoEstorno>` as-of o fim do período e passam a data (ou
// undefined) para cá. O resultado vira spread na linha do snapshot: campos
// OPCIONAIS (mantêm `schema:2`; snapshots pré-F16 não os têm → sem sinal, sem erro).

export type MarcaEstorno = { estornada?: true; estornoData?: string }

// `estornoData` = a data (yyyy-MM-dd) da movimentação/lançamento que desfez esta
// linha, ou null/undefined quando não houve estorno. Devolve objeto vazio quando
// não estornada — o spread `...marcaEstorno(x)` não adiciona campo nenhum.
export function marcaEstorno(estornoData: string | null | undefined): MarcaEstorno {
  return estornoData ? { estornada: true, estornoData } : {}
}
