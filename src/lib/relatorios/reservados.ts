import { CATEGORIA_ORDEM, type CategoriaAtivo } from '@/lib/dominio'
import type { ItemReservado } from '@/lib/relatorios/tipos'

// O card "Reservados" do relatório, separado por categoria (v1.71.1). Módulo PURO — o card
// (Server Component) e os testes o leem; nada de servidor aqui.
//
// A ORDEM DOS GRUPOS é `CATEGORIA_ORDEM`, a MESMA que o card vizinho, "Disponíveis por
// modelo", usa no mesmo relatório (`disponiveisPorModeloDeEstado`, em
// `queries/relatorios/estoque.ts`) — e que `categoriaDeEstado`/`estoqueCatStatusDeEstado`
// também usam. Não é a ordem do enum do banco nem a de `CATEGORIA_META`, que são outras: quem
// lê os dois cards lado a lado tem de achar "Notebook" no mesmo lugar nos dois.
//
// O SNAPSHOT ANTIGO não tem `categoria` (o campo é opcional e o snapshot é congelado — spec §7):
// basta UM item sem ela para `grupos` vir `null`, e o card mostra o total e a lista corrida de
// antes. Agrupar parte da lista e jogar o resto num "sem categoria" inventaria uma categoria que
// ninguém gravou.

export type GrupoReservados = {
  categoria: CategoriaAtivo
  itens: ItemReservado[]
  total: number
}

export type ReservadosAgrupados = {
  /** Quantos reservados há no card — igual ao `kpis.reservado` do mesmo relatório (v2). */
  total: number
  /** `null` = sem grupos (algum item sem `categoria`: snapshot gerado antes da v1.71.1). */
  grupos: GrupoReservados[] | null
}

const porPatrimonio = (a: ItemReservado, b: ItemReservado) =>
  a.patrimonio.localeCompare(b.patrimonio, 'pt-BR')

export function agruparReservados(itens: readonly ItemReservado[]): ReservadosAgrupados {
  const total = itens.length
  const porCategoria = new Map<CategoriaAtivo, ItemReservado[]>()
  for (const item of itens) {
    const categoria = item.categoria
    if (categoria === undefined) return { total, grupos: null }
    const lista = porCategoria.get(categoria)
    if (lista) lista.push(item)
    else porCategoria.set(categoria, [item])
  }

  // Categoria fora de `CATEGORIA_ORDEM` não existe hoje (`dominio.test.ts` prova a cobertura),
  // mas se um valor novo do enum chegar antes da constante, ele entra NO FIM em vez de sumir:
  // o total do card nunca pode ser maior que a soma dos grupos.
  const ordem = [
    ...CATEGORIA_ORDEM,
    ...[...porCategoria.keys()].filter((c) => !CATEGORIA_ORDEM.includes(c)).sort(),
  ]
  const grupos = ordem
    .filter((c) => porCategoria.has(c))
    .map((categoria) => {
      const lista = [...(porCategoria.get(categoria) ?? [])].sort(porPatrimonio)
      return { categoria, itens: lista, total: lista.length }
    })
  return { total, grupos }
}

/** "1 reservado" · "12 reservados" · "1.234 reservados". */
export function rotuloReservados(n: number): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'reservado' : 'reservados'}`
}
