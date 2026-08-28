// A ponte TIPO → ITEM (F38 · frentes D e E).
//
// O PROBLEMA. O checklist da devolução passa a listar TIPOS (`tipos_item`, F37),
// e a resolução de pendência parte de `pendencias_item.item`, que também é um
// **slug de tipo**. Mas lançamento de estoque precisa de um **item do catálogo**
// (`itens.id`) — tipo não tem saldo, item tem. Entre os dois falta uma ponte, e
// esta ordem a fecha.
//
// O QUE O MODELO PERMITE, E O QUE NÃO PERMITE. `itens` é catálogo **global** (18
// linhas em produção) com `tipo_id` anulável (0114); `tipos_item` **não tem
// `filial_id`**. A filial só existe no diário (`lancamentos_item.filial_id`),
// nunca no catálogo. Por isso "o item de catálogo daquele tipo **naquela filial**"
// não é uma consulta que este modelo suporte: os candidatos são os mesmos em toda
// filial. A filial entra como INFORMAÇÃO na hora de escolher (o saldo daquele item
// ali), não como filtro do catálogo. Decisão registrada em docs/DECISOES.md.
//
// A REGRA, e ela é a mesma nas duas frentes:
//   · exatamente UM item ativo daquele tipo  → resolve sozinho;
//   · DOIS OU MAIS                            → a tela pergunta qual;
//   · ZERO                                    → não bloqueia nada. A devolução é
//     registrada (e a pendência, resolvida) do mesmo jeito; o lançamento não
//     nasce, e a tela diz por quê.
//
// A última linha é a mais importante: **conferir a devolução e resolver pendência
// NUNCA podem falhar por causa do catálogo.** O acervo de equipamentos não pode
// ficar refém do cadastro de acessórios.

/** O que esta ponte precisa saber de um item do catálogo. */
export type ItemDoCatalogo = {
  id: number
  nome: string
  ativo: boolean
  tipo_id: number | null
}

/** O que esta ponte precisa saber de um tipo. */
export type TipoParaPonte = {
  id: number
  slug: string
  rotulo: string
}

export type ResolucaoTipoItem =
  /** Um só candidato: o lançamento pode nascer sem perguntar nada. */
  | { situacao: 'resolvido'; item: ItemDoCatalogo }
  /** Nenhum candidato: segue sem lançamento, e a tela explica. */
  | { situacao: 'sem_item'; motivo: string }
  /** Vários: a tela pergunta qual, entre estes. */
  | { situacao: 'ambiguo'; candidatos: ItemDoCatalogo[] }

/** A frase que a tela mostra quando o tipo não tem item de catálogo. */
export const MSG_SEM_ITEM_DO_TIPO =
  'Nenhum item de catálogo deste tipo — a devolução foi registrada, mas o estoque não mudou.'

/** A frase equivalente no caminho da pendência (§E). */
export const MSG_SEM_ITEM_DO_TIPO_PENDENCIA =
  'Nenhum item de catálogo deste tipo — a pendência foi resolvida, mas o estoque não mudou.'

/** A frase que a tela mostra quando o operador precisa escolher. */
export const MSG_ESCOLHA_O_ITEM = 'Escolha qual item do catálogo entra no estoque'

/** Os candidatos de um tipo: itens ATIVOS que apontam para ele. Ordem estável. */
export function candidatosDoTipo(
  itens: readonly ItemDoCatalogo[],
  tipoId: number | null | undefined,
): ItemDoCatalogo[] {
  if (tipoId == null) return []
  return itens
    .filter((i) => i.ativo && i.tipo_id === tipoId)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id - b.id)
}

/** A ponte, a partir do id do tipo. */
export function resolverItemDoTipo(
  itens: readonly ItemDoCatalogo[],
  tipoId: number | null | undefined,
  mensagemSemItem: string = MSG_SEM_ITEM_DO_TIPO,
): ResolucaoTipoItem {
  const candidatos = candidatosDoTipo(itens, tipoId)
  if (candidatos.length === 1) return { situacao: 'resolvido', item: candidatos[0] }
  if (candidatos.length === 0) return { situacao: 'sem_item', motivo: mensagemSemItem }
  return { situacao: 'ambiguo', candidatos }
}

/**
 * A ponte a partir do SLUG — o caminho da §E, onde a pendência guarda
 * `pendencias_item.item` (um slug de tipo, texto livre desde a 0050: sem FK e sem
 * CHECK). Slug que não corresponde a tipo nenhum cai em `sem_item`, como deve: é
 * exatamente o caso do histórico gravado antes de `tipos_item` existir.
 */
export function resolverItemDoSlug(
  itens: readonly ItemDoCatalogo[],
  tipos: readonly TipoParaPonte[],
  slug: string | null | undefined,
  mensagemSemItem: string = MSG_SEM_ITEM_DO_TIPO_PENDENCIA,
): ResolucaoTipoItem {
  const alvo = (slug ?? '').trim().toLowerCase()
  if (!alvo) return { situacao: 'sem_item', motivo: mensagemSemItem }
  const tipo = tipos.find((t) => t.slug === alvo)
  if (!tipo) return { situacao: 'sem_item', motivo: mensagemSemItem }
  return resolverItemDoTipo(itens, tipo.id, mensagemSemItem)
}

/**
 * A escolha efetiva de uma linha do checklist: a resolução automática, ou o item
 * que o operador escolheu no combobox. Devolve `null` quando não há lançamento a
 * fazer — e `null` **nunca** é erro neste desenho.
 */
export function itemEscolhido(
  resolucao: ResolucaoTipoItem,
  escolhaDoOperador?: number | null,
): ItemDoCatalogo | null {
  if (resolucao.situacao === 'resolvido') return resolucao.item
  if (resolucao.situacao === 'ambiguo' && escolhaDoOperador != null) {
    return resolucao.candidatos.find((c) => c.id === escolhaDoOperador) ?? null
  }
  return null
}
