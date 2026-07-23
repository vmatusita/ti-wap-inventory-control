import { precisaRepor } from '@/lib/validators/item'

// Ponto de reposição (F12 · I5) — o CRUZAMENTO catálogo × saldo que o badge de
// /itens e o card do dashboard fazem. Só funções puras (sem banco, sem React),
// para as duas telas contarem exatamente a mesma coisa. A REGRA em si é uma só e
// mora em `precisaRepor` (validators/item.ts); aqui é só o cruzamento.
//
// Por que um mapa: `estoque_minimo` é dado do ITEM (vem de `listarItensAtivos`,
// catálogo) e o estoque vem da RPC `rel_saldo_itens` (saldo) — duas leituras que
// se encontram por `item_id`.
//
// ARMADILHA tratada aqui: `listarItensAtivos` só traz item ATIVO, enquanto a RPC
// devolve item ativo OU com lançamento no recorte. Um item DESATIVADO que ainda
// tem saldo aparece na tabela e não tem entrada no mapa — ele conta como mínimo
// 0, isto é, NUNCA alerta (ninguém repõe item que saiu de linha) e nunca estoura
// por `undefined`.

/** `itens.id` → `itens.estoque_minimo`. Objeto simples (e não `Map`) porque
 *  atravessa props de componente igual ao `porFilial` de `SaldoItemFiliais`. */
export type MinimosPorItem = Readonly<Record<number, number>>

export function minimosDoCatalogo(
  itens: readonly { id: number; estoque_minimo: number }[],
): MinimosPorItem {
  const mapa: Record<number, number> = {}
  for (const i of itens) mapa[i.id] = i.estoque_minimo
  return mapa
}

/** Mínimo configurado do item — 0 (= sem alerta) quando ele não está no mapa
 *  (item desativado com saldo) ou quando o valor não é um número utilizável. */
export function minimoDoItem(minimos: MinimosPorItem, itemId: number): number {
  const m = minimos[itemId]
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 0
}

/** Estoque consolidado por item, para a tabela consultar linha a linha sem
 *  varrer a lista de saldos a cada linha. */
export function estoquePorItem(
  saldos: readonly { item_id: number; estoque: number }[],
): Readonly<Record<number, number>> {
  const mapa: Record<number, number> = {}
  for (const s of saldos) mapa[s.item_id] = s.estoque
  return mapa
}

export type SaldoConsolidado = { item_id: number; item: string; estoque: number }

export type ItemParaRepor = SaldoConsolidado & { minimo: number; abaixo: number }

/** Itens cujo estoque CONSOLIDADO está abaixo do mínimo configurado, do mais
 *  crítico (maior distância do mínimo) para o menos; empate resolvido pelo nome,
 *  para a ordem ser sempre a mesma entre dois carregamentos da tela.
 *
 *  `abaixo` é quanto falta comprar para voltar ao mínimo — NÃO confundir com o
 *  "faltam N" da tela de itens, que é `atrelados − estoque` (compromisso já
 *  assumido). São dois avisos diferentes que podem conviver na mesma linha. */
export function itensParaRepor(
  saldos: readonly SaldoConsolidado[],
  minimos: MinimosPorItem,
): ItemParaRepor[] {
  const lista: ItemParaRepor[] = []
  for (const s of saldos) {
    const minimo = minimoDoItem(minimos, s.item_id)
    if (!precisaRepor(s.estoque, minimo)) continue
    lista.push({
      item_id: s.item_id,
      item: s.item,
      estoque: s.estoque,
      minimo,
      abaixo: minimo - s.estoque,
    })
  }
  return lista.sort(
    (a, b) => b.abaixo - a.abaixo || a.item.localeCompare(b.item, 'pt-BR'),
  )
}
