// Efeito de um lançamento no ESTOQUE (a prateleira) — correção avulsa de
// 19/08/2026 (feedback do Johnny: "está confuso o controle de itens").
//
// O PROBLEMA. A coluna Qtd. do histórico imprimia o número CRU do lançamento
// com "+" na frente de tudo que fosse positivo — e fora do Ajuste a quantidade
// é SEMPRE positiva no banco. Resultado: uma Liberação de 3 (três mouses
// SAINDO da prateleira) aparecia como "+3", e a direção do movimento só se
// deduzia decorando a semântica de cada cor de pílula. Este módulo dá o sinal
// pelo EFEITO na prateleira, que é o que o operador quer ler.
//
// A FÓRMULA É DO BANCO — a mesma da RPC `rel_saldo_itens` e de
// `calcularSaldoApos` (migration 0027, doutrina Total/Estoque F6A §A4):
//   entrada   → estoque +q (total +q)
//   saida     → estoque −q (vai para "liberados": ficou com uma pessoa)
//   reserva   → estoque −q (vai para "atrelados": preso a um chamado)
//   liberacao → estoque +q (volta de "atrelados")
//   retorno   → estoque +q (volta de "liberados")
//   ajuste    → estoque ±q (o próprio sinal da quantidade; total idem)
// O teste confere esta tabela CONTRA `calcularSaldoApos`, para as duas contas
// nunca divergirem.
//
// Módulo PURO (sem React, sem Supabase): serve à coluna Qtd. do histórico e à
// prévia de efeito do diálogo de lançamento.

import type { TipoLancamento } from '@/lib/dominio'

/** Quanto este lançamento muda o estoque da prateleira (com sinal). A
 *  quantidade chega como está no banco: positiva em todos os tipos, exceto o
 *  ajuste, que carrega o próprio sinal. */
export function efeitoNoEstoque(tipo: TipoLancamento, quantidade: number): number {
  switch (tipo) {
    case 'entrada':
    case 'liberacao':
    case 'retorno':
      return quantidade
    case 'saida':
    case 'reserva':
      return -quantidade
    case 'ajuste':
      return quantidade
  }
}

/** O texto da coluna Qtd. do histórico: o efeito na prateleira, com sinal
 *  explícito ("+3" / "-3"), em pt-BR. */
export function qtdComSinal(tipo: TipoLancamento, quantidade: number): string {
  const efeito = efeitoNoEstoque(tipo, quantidade)
  const texto = efeito.toLocaleString('pt-BR')
  return efeito > 0 ? `+${texto}` : texto
}

/** A Dica do cabeçalho Qtd. — explica o sinal UMA vez, para a tabela inteira. */
export const DICA_QTD_HISTORICO =
  'Quantidade com o sinal do efeito na prateleira: + entra no estoque, − sai. O Total só muda com Entrada e Ajuste.'

export type PreviewEstoque = {
  antes: number
  depois: number
  /** `true` quando o banco vai recusar: estoque nunca fica negativo. */
  recusado: boolean
}

/** Prévia do diálogo de lançamento: "estoque 14 → 12". Devolve `null` quando
 *  ainda não há o que dizer — quantidade não digitada/zero, inválida para o
 *  tipo (negativa fora do Ajuste) ou saldo da filial ainda não carregado. A
 *  prévia NUNCA decide nada: quem recusa de verdade é o trigger do banco. */
export function previewEstoque(
  tipo: TipoLancamento,
  quantidade: number,
  estoqueAtual: number | null | undefined,
): PreviewEstoque | null {
  if (estoqueAtual == null || !Number.isFinite(estoqueAtual)) return null
  if (!Number.isInteger(quantidade) || quantidade === 0) return null
  if (tipo !== 'ajuste' && quantidade < 0) return null
  const depois = estoqueAtual + efeitoNoEstoque(tipo, quantidade)
  return { antes: estoqueAtual, depois, recusado: depois < 0 }
}

/** O texto da prévia, pronto para a linha do carrinho. */
export function textoPreview(p: PreviewEstoque): string {
  const antes = p.antes.toLocaleString('pt-BR')
  const depois = p.depois.toLocaleString('pt-BR')
  const base = `Estoque na filial: ${antes} → ${depois}`
  return p.recusado ? `${base} — será recusado (estoque insuficiente)` : base
}
