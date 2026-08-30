// F38 · a regra do LOTE HOMOGÊNEO, extraída de `components/movimentacoes/nova/
// itens-do-lote.ts` na revisão de 29/08/2026.
//
// POR QUE ELA MUDOU DE CASA. A F39 passou a reusá-la no SERVIDOR: o aviso de
// `termos/preparo.ts` (uma decisão de `prepararTermo`, que é Server Action) precisa
// exatamente da mesma condição, para que as duas pontas não possam divergir. Só que
// isso deixava um módulo de `lib/` importando valor de dentro de `components/nova/`
// — o diretório inteiro do wizard —, e no dia em que alguém pusesse `'use client'`
// naquele arquivo o bundler trocaria o import por uma REFERÊNCIA: `checklistPodeLancar`
// viraria `undefined` e `prepararTermo` estouraria em runtime, com `tsc`, `eslint` e
// `next build` verdes. É a classe de defeito que `components/relatorios/
// fronteira-rsc.test.ts` documenta, e a defesa contra ela é a regra não morar mais lá.
//
// `itens-do-lote.ts` REEXPORTA os três nomes: o wizard e o teste dele continuam
// importando do mesmo lugar de sempre, e a fonte é uma só.

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
