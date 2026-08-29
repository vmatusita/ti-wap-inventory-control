// F38 · D13 — de "o que a tela coletou" para "as linhas de item do lote".
//
// Módulo PURO (sem React), no idioma de `config.ts`/`troca-upgrade.ts`. Ele é o
// único lugar que sabe traduzir as DUAS coletas da tela num só array de
// `ItemJuntoInput`:
//
//   entrega   → a seção "Itens que vão junto" (`config.itensJunto`), onde o
//               operador escolheu a qual equipamento cada periférico acompanha;
//   devolução → o checklist de dois desfechos (`itensDevolvidos`), onde cada tipo
//               marcado "Voltou" que resolveu um item de catálogo vira UMA linha.
//
// ⚠ O ÍNDICE É O CONTRATO COM A RPC. `montarItensDoPar` monta o lote com a metade
// PRINCIPAL primeiro e a CONTRAPARTIDA depois — e é essa ordem que a RPC 0117 usa
// para casar `indice_movimentacao` com a movimentação criada. Por isso a
// contrapartida entra deslocada de `itens.length`, e por isso o teste desta função
// existe: um deslocamento errado prenderia o fone na movimentação do monitor.
//
// ⚠ O CHECKLIST NÃO TEM "A QUAL EQUIPAMENTO". Ele é um só para o lote inteiro (é
// conferência da devolução, não escolha por ativo), então as linhas dele apontam a
// PRIMEIRA movimentação da sua metade — a mesma convenção de padrão do D13. Com um
// equipamento, que é o caso comum, não há diferença nenhuma.
//
// ⚠ QUANTIDADE 1 POR LINHA DO CHECKLIST. Ele é booleano e continua sendo.
//
// Tipo marcado "Voltou" cujo `itemId` é `null` (a ponte não resolveu, ou o operador
// não escolheu entre os candidatos) simplesmente NÃO vira linha — e isso não é
// erro: a devolução é registrada do mesmo jeito, e a tela já disse por quê.

import type { Config, ItemJunto } from '@/components/movimentacoes/nova/config'
import type { ContrapartidaTroca } from '@/components/movimentacoes/nova/troca-upgrade'
import type { ItemJuntoInput } from '@/lib/validators/movimentacao'

/** O que esta regra precisa saber de cada ativo do lote. */
export type LoteParaChecklist = {
  filial_id: number
  colaborador_atual: string | null
}

/**
 * ⚠ O CHECKLIST SÓ VIRA LANÇAMENTO NUM LOTE HOMOGÊNEO — achado da revisão
 * adversarial da F38, e a razão é aritmética, não estética.
 *
 * O checklist é UM só para o lote inteiro (é conferência da devolução, não escolha
 * por ativo), então suas linhas apontam a primeira movimentação da metade. Dessa
 * movimentação saem DUAS coisas que decidem o lançamento: a **filial** onde o
 * acessório é reposto e a **pessoa** cuja conta baixa.
 *
 * Num lote com ativos de filiais diferentes, o acessório voltaria para a
 * prateleira errada. Num lote com detentores diferentes, o fone que o Fulano
 * devolveu baixaria da conta da Beatriz — e o Fulano continuaria devendo. Os dois
 * erros são silenciosos e só apareceriam meses depois, num relatório que ninguém
 * consegue explicar.
 *
 * Então: lote misto NÃO gera lançamento. A devolução é registrada normalmente, as
 * pendências do "Faltou" nascem como sempre, e a tela avisa. É a mesma honestidade
 * de `prefillContrapartida`, que se recusa a chutar o nome com detentores mistos.
 *
 * Lote de um ativo só — o caso comum — é homogêneo por definição.
 */
export function checklistPodeLancar(lote?: readonly LoteParaChecklist[]): boolean {
  if (!lote || lote.length <= 1) return true
  const filiais = new Set(lote.map((a) => a.filial_id))
  if (filiais.size > 1) return false
  const detentores = new Set(lote.map((a) => (a.colaborador_atual ?? '').trim()))
  return detentores.size === 1
}

/** O aviso que a tela mostra quando o lote misto desliga o checklist. */
export const MSG_LOTE_MISTO_SEM_LANCAMENTO =
  'Este lote tem equipamentos de filiais ou de pessoas diferentes, então marcar "Voltou" não mexe no estoque — não dá para saber de qual prateleira nem de qual conta o acessório é. Registre as devoluções em lotes separados para o estoque acompanhar.'

/** Uma linha do checklist vira lançamento? Só quando resolveu um item. */
function linhasDoChecklist(
  devolvidos: readonly { tipoSlug: string; itemId: number | null }[],
  indice: number,
): ItemJuntoInput[] {
  return devolvidos
    .filter((d) => d.itemId != null)
    .map((d) => ({ indice, item_id: d.itemId as number, quantidade: 1 }))
}

/** As linhas da seção "Itens que vão junto", já no formato do input. */
function linhasDaEntrega(itensJunto: readonly ItemJunto[], teto: number): ItemJuntoInput[] {
  return itensJunto
    // Índice fora do lote não vira linha: o lote pode ter encolhido depois de a
    // seção ser preenchida (o operador remove um equipamento e o índice fica
    // órfão). A RPC recusaria o lote inteiro por isso — e derrubar o lote por
    // causa de um periférico seria trocar o essencial pelo acessório.
    .filter((l) => l.indice >= 0 && l.indice < teto && l.itemId > 0 && l.quantidade > 0)
    .map((l) => ({ indice: l.indice, item_id: l.itemId, quantidade: l.quantidade }))
}

/**
 * Reancora `itensJunto` quando o LOTE muda de tamanho fora do botão "remover".
 *
 * ⚠ O ÍNDICE É POSICIONAL, e posição não sobrevive a um lote que encolheu. O
 * caminho `remover` do formulário já reajusta (achado da revisão adversarial da
 * fase), mas a RESTAURAÇÃO DE RASCUNHO não: ela remonta o lote a partir dos ids
 * salvos e deixa de fora os ativos que sumiram do banco, sem tocar nos índices. Um
 * fone preso ao 3º equipamento passava a acompanhar OUTRO equipamento — ou sumia
 * calado, porque `linhasDaEntrega` descarta índice fora do lote.
 *
 * A tradução é feita pelo ID, que é estável: a linha vai para a nova posição do
 * MESMO equipamento, e some junto com ele quando ele não volta.
 */
export function reindexarItensJunto(
  itensJunto: readonly ItemJunto[],
  idsOriginais: readonly string[],
  idsRestantes: readonly string[],
): ItemJunto[] {
  if (itensJunto.length === 0) return []
  const novaPosicao = new Map<string, number>()
  idsRestantes.forEach((id, i) => novaPosicao.set(id, i))

  const saidas: ItemJunto[] = []
  for (const l of itensJunto) {
    const id = idsOriginais[l.indice]
    const destino = id === undefined ? undefined : novaPosicao.get(id)
    if (destino === undefined) continue // o equipamento não voltou: a linha vai com ele
    saidas.push({ ...l, indice: destino })
  }
  return saidas
}

/**
 * O array de itens que acompanha o lote, na numeração que a RPC espera.
 *
 * `totalPrincipal` é quantos ativos a metade principal submeteu — é ele que
 * desloca os índices da contrapartida.
 */
export function montarItensJuntoDoLote(args: {
  config: Config
  totalPrincipal: number
  contrapartida?: ContrapartidaTroca | null
  /** Quantos ativos a contrapartida submeteu (0 quando ela não vai junto). */
  totalContrapartida?: number
  /**
   * O lote da metade PRINCIPAL, na ordem submetida. Serve a uma pergunta só:
   * a devolução é homogênea? (ver `checklistPodeLancar`). Opcional — sem ele, o
   * checklist é tratado como homogêneo, que é o comportamento de um ativo só.
   */
  lotePrincipal?: readonly LoteParaChecklist[]
  /** Idem, para a metade da contrapartida. */
  loteContrapartida?: readonly LoteParaChecklist[]
}): ItemJuntoInput[] {
  const { config, totalPrincipal } = args
  const totalContra = args.totalContrapartida ?? 0
  const linhas: ItemJuntoInput[] = []

  if (totalPrincipal > 0) {
    if (config.tipo === 'saida' || config.tipo === 'emprestimo') {
      linhas.push(...linhasDaEntrega(config.itensJunto ?? [], totalPrincipal))
    }
    if (config.tipo === 'devolucao' && checklistPodeLancar(args.lotePrincipal)) {
      linhas.push(...linhasDoChecklist(config.itensDevolvidos ?? [], 0))
    }
  }

  // A metade oposta do par troca/upgrade. Só a DEVOLUÇÃO coleta checklist; a
  // metade `saida` da contrapartida não tem seção de itens que vão junto (a
  // ordem F38 a pediu só na entrega principal).
  if (args.contrapartida && totalContra > 0) {
    const alvoEhDevolucao = config.tipo === 'saida'
    if (alvoEhDevolucao && checklistPodeLancar(args.loteContrapartida)) {
      linhas.push(...linhasDoChecklist(args.contrapartida.itensDevolvidos ?? [], totalPrincipal))
    }
  }

  return linhas
}
