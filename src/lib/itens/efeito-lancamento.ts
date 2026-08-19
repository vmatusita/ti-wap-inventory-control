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
// 19/08/2026 (revisão, achado 10): a prévia do diálogo (`previewEstoque`) só
// enxerga o limite da PRATELEIRA (estoque não fica negativo). Em Devolução e
// Retorno o efeito aqui é sempre positivo, então esse limite nunca acende —
// mas o banco ainda confere o OUTRO limite, o do PAR ida/volta (o atrelado ao
// chamado, o liberado em aberto), que esta função não recebe como parâmetro.
// `alertaPar` marca esse ponto cego para o operador, em vez de a prévia
// prometer um silêncio que ela não consegue entregar nesses dois tipos.
//
// Módulo PURO (sem React, sem Supabase): serve à coluna Qtd. do histórico e à
// prévia de efeito do diálogo de lançamento.

import { TIPO_LANCAMENTO_META, type TipoLancamento } from '@/lib/dominio'

// Rótulos oficiais derivados de TIPO_LANCAMENTO_META — nunca digitados à mão
// (mesma regra de src/lib/ajuda/conteudo/lancar-itens.ts): se o rótulo mudar
// num só lugar (F6A §A4), o texto daqui acompanha sem precisar editar aqui.
const ROTULO_DEVOLUCAO = TIPO_LANCAMENTO_META.liberacao.rotulo
const ROTULO_RETORNO = TIPO_LANCAMENTO_META.retorno.rotulo
const ROTULO_AJUSTE = TIPO_LANCAMENTO_META.ajuste.rotulo

/** Quanto este lançamento muda o estoque da prateleira (com sinal). A
 *  quantidade chega como está no banco: positiva em todos os tipos, exceto o
 *  ajuste, que carrega o próprio sinal. */
export function efeitoNoEstoque(tipo: TipoLancamento, quantidade: number): number {
  switch (tipo) {
    // 19/08/2026 (revisão, achado 15): o ajuste PARECIA diferente por carregar
    // o próprio sinal no banco — mas a conta é a mesma soma, então entra aqui.
    case 'entrada':
    case 'liberacao':
    case 'retorno':
    case 'ajuste':
      return quantidade
    case 'saida':
    case 'reserva':
      return -quantidade
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
  /** `true` em Devolução e Retorno (achado 10, 19/08/2026 revisão): o efeito
   *  aqui é sempre positivo, então `recusado` nunca acende — mas o banco
   *  ainda confere o limite do PAR ida/volta, que esta função não enxerga.
   *  Não é recusa: é aviso de que a prévia não é a palavra final aqui. */
  alertaPar: boolean
}

/** Prévia do diálogo de lançamento: "estoque 14 → 12". Devolve `null` quando
 *  ainda não há o que dizer — quantidade não digitada/zero, inválida para o
 *  tipo (negativa fora do Ajuste) ou saldo da filial ainda não carregado.
 *
 *  19/08/2026 (revisão, achado 10): a prévia só cobre o limite da prateleira
 *  (é o que `recusado` significa). Em Devolução/Retorno o efeito é sempre
 *  positivo, então `recusado` nunca acende aqui — mas o banco ainda pode
 *  recusar pelo limite do PAR ida/volta (a quantidade em aberto do chamado ou
 *  da liberação), que esta função não tem como calcular. `alertaPar` avisa
 *  esse ponto cego. Fora isso, a prévia NUNCA decide nada: quem recusa de
 *  verdade, sempre, é o trigger do banco. */
export function previewEstoque(
  tipo: TipoLancamento,
  quantidade: number,
  estoqueAtual: number | null | undefined,
): PreviewEstoque | null {
  if (estoqueAtual == null || !Number.isFinite(estoqueAtual)) return null
  if (!Number.isInteger(quantidade) || quantidade === 0) return null
  if (tipo !== 'ajuste' && quantidade < 0) return null
  const depois = estoqueAtual + efeitoNoEstoque(tipo, quantidade)
  return {
    antes: estoqueAtual,
    depois,
    recusado: depois < 0,
    alertaPar: tipo === 'liberacao' || tipo === 'retorno',
  }
}

/** Aviso de operador (achado 14, 19/08/2026 revisão) para quantidade negativa
 *  fora do Ajuste — canal SEPARADO de `previewEstoque`. Hoje, nesse caso,
 *  `previewEstoque` devolve `null` (quantidade inválida para o tipo) e o
 *  diálogo simplesmente não desenha nada: a prévia que estava visível some
 *  sem explicação, e só o Zod fala — no envio. Esta função fala ANTES.
 *  Devolve `null` para tudo que já é válido: positivo, zero, não inteiro
 *  (inclusive `NaN`), ou negativo — mas só no Ajuste, onde é legítimo. */
export function avisoQuantidadeInvalida(tipo: TipoLancamento, quantidade: number): string | null {
  if (!Number.isInteger(quantidade) || quantidade >= 0) return null
  if (tipo === 'ajuste') return null
  return `Quantidade negativa só existe no ${ROTULO_AJUSTE}. Para tirar item da prateleira, digite a quantidade em positivo — o tipo escolhido já diz que ela está saindo.`
}

/** O texto da prévia, pronto para a linha do carrinho. */
export function textoPreview(p: PreviewEstoque): string {
  const antes = p.antes.toLocaleString('pt-BR')
  const depois = p.depois.toLocaleString('pt-BR')
  const base = `Estoque na filial: ${antes} → ${depois}`
  if (p.recusado) return `${base} — será recusado (estoque insuficiente)`
  if (p.alertaPar) {
    return `${base} — o estoque comporta, mas o banco ainda confere a quantidade em aberto do par: na ${ROTULO_DEVOLUCAO}, o que está atrelado ao chamado; no ${ROTULO_RETORNO}, o que está liberado em aberto`
  }
  return base
}
