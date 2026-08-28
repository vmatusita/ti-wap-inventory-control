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
}): ItemJuntoInput[] {
  const { config, totalPrincipal } = args
  const totalContra = args.totalContrapartida ?? 0
  const linhas: ItemJuntoInput[] = []

  if (totalPrincipal > 0) {
    if (config.tipo === 'saida' || config.tipo === 'emprestimo') {
      linhas.push(...linhasDaEntrega(config.itensJunto ?? [], totalPrincipal))
    }
    if (config.tipo === 'devolucao') {
      linhas.push(...linhasDoChecklist(config.itensDevolvidos ?? [], 0))
    }
  }

  // A metade oposta do par troca/upgrade. Só a DEVOLUÇÃO coleta checklist; a
  // metade `saida` da contrapartida não tem seção de itens que vão junto (a
  // ordem F38 a pediu só na entrega principal).
  if (args.contrapartida && totalContra > 0) {
    const alvoEhDevolucao = config.tipo === 'saida'
    if (alvoEhDevolucao) {
      linhas.push(...linhasDoChecklist(args.contrapartida.itensDevolvidos ?? [], totalPrincipal))
    }
  }

  return linhas
}
