// Conferência de estoque — inventário físico de UMA filial (F31 · ITN-04).
//
// O QUE ESTE MÓDULO É. Só a aritmética: o que foi contado, o que diverge, quais
// ajustes nascem disso e em que blocos eles são enviados. Nada de React, nada de
// Supabase — é onde a regra fica testável sem montar tela.
//
// O QUE A CONFERÊNCIA GRAVA. Nada de novo: cada divergência vira um `ajuste`
// pela MESMA esteira de `lancarItens`, com a observação de inventário como
// justificativa (o CHECK `lanc_item_ajuste_obs` a exige). Não há tipo novo no
// enum nem tabela de inventário — quem quiser reconstruir a conferência lê os
// ajustes daquela data pela observação. É deliberado: "histórico/agenda de
// inventários" é backlog declarado da ordem F31.
//
// A CONTAGEM É DO **ESTOQUE**, não do Total. É o número que a pessoa enxerga na
// prateleira: o que está atrelado a um chamado ou liberado com alguém não está
// lá para ser contado. Por isso `sistema` vem de `SaldoItem.estoque` — e por isso
// o ajuste de diferença mexe no Total (ajuste sempre mexe), que é justamente o
// certo: se sumiram 3 mouses, a TI passou a ter 3 a menos, não só a prateleira.

import type { SaldoItem } from '@/lib/queries/itens'

/** Uma linha CONTADA da conferência (linha em branco não vira `LinhaConferencia`). */
export type LinhaConferencia = {
  itemId: number
  item: string
  /** Estoque que o sistema diz haver naquela filial. */
  sistema: number
  /** O que a pessoa contou na prateleira. */
  contado: number
  /** `contado − sistema`. Positivo = sobrando; negativo = faltando. */
  diff: number
}

export type ResumoConferencia = {
  /** Quantas linhas foram preenchidas (inclusive as que bateram). */
  conferidos: number
  /** Quantas divergem (diff ≠ 0). */
  comDiferenca: number
  /** Soma das sobras (sempre ≥ 0). */
  sobrando: number
  /** Soma das faltas, em MÓDULO (sempre ≥ 0). */
  faltando: number
}

/** Um ajuste a gravar: o item e o delta com sinal. */
export type AjusteConferencia = { item_id: number; quantidade: number }

/**
 * Texto de "contado" → número, ou `null` quando a linha NÃO foi conferida.
 *
 * Linha em branco (ou só espaços) é "não conferido" e fica de fora de tudo — não
 * é "contei zero". Distinguir os dois é o ponto: tratar vazio como zero
 * transformaria uma conferência parcial num pedido de zerar o estoque inteiro da
 * filial, que é o pior erro possível nesta tela.
 *
 * Lixo (texto, negativo, fracionário) também vale como não conferido: a tela
 * impede digitá-lo, e o que vier do `sessionStorage` é dado de fora.
 */
export function contagemDaLinha(bruto: string | null | undefined): number | null {
  const t = (bruto ?? '').trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null
  return n
}

/**
 * As linhas CONTADAS, na ordem dos saldos (que já vêm ordenados por grupo/ordem).
 * Item que não está em `saldos` é ignorado — a contagem é sempre sobre o catálogo
 * que a tela mostrou.
 */
export function linhasDaConferencia(
  saldos: readonly SaldoItem[],
  contagens: Readonly<Record<number, string>>,
): LinhaConferencia[] {
  const linhas: LinhaConferencia[] = []
  for (const s of saldos) {
    const contado = contagemDaLinha(contagens[s.item_id])
    if (contado === null) continue
    linhas.push({
      itemId: s.item_id,
      item: s.item,
      sistema: s.estoque,
      contado,
      diff: contado - s.estoque,
    })
  }
  return linhas
}

export function resumoDaConferencia(
  linhas: readonly LinhaConferencia[],
): ResumoConferencia {
  let comDiferenca = 0
  let sobrando = 0
  let faltando = 0
  for (const l of linhas) {
    if (l.diff === 0) continue
    comDiferenca++
    if (l.diff > 0) sobrando += l.diff
    else faltando += -l.diff
  }
  return { conferidos: linhas.length, comDiferenca, sobrando, faltando }
}

/** Só as divergências viram ajuste. Linha que bateu não gera lançamento nenhum. */
export function ajustesDaConferencia(
  linhas: readonly LinhaConferencia[],
): AjusteConferencia[] {
  return linhas
    .filter((l) => l.diff !== 0)
    .map((l) => ({ item_id: l.itemId, quantidade: l.diff }))
}

/**
 * Quebra a lista em blocos de no máximo `teto` — o envio respeita o mesmo teto de
 * linhas do lançamento (`MAX_LINHAS_LOTE_ITEM`), porque é pela esteira dele que a
 * conferência grava.
 *
 * `teto <= 0` devolve um bloco só com tudo, em vez de laçar para sempre: é a
 * resposta segura para uma constante mal configurada (o envio falharia no Zod,
 * com mensagem, em vez de travar o navegador).
 */
export function particionar<T>(itens: readonly T[], teto: number): T[][] {
  if (itens.length === 0) return []
  if (!Number.isFinite(teto) || teto <= 0) return [[...itens]]
  const blocos: T[][] = []
  for (let i = 0; i < itens.length; i += teto) {
    blocos.push(itens.slice(i, i + teto))
  }
  return blocos
}

/**
 * O que AINDA falta gravar — a idempotência do reenvio.
 *
 * Depois de um envio parcial, a tela reoferece "Registrar diferenças"; sem este
 * filtro, o segundo clique regravaria os ajustes que já entraram e o estoque
 * andaria DUAS vezes na mesma direção. `gravados` é a lista de itens confirmados
 * pelo servidor, e ela sobrevive no rascunho — então nem um F5 no meio faz o
 * reenvio duplicar.
 *
 * ⚠ INVARIANTE DE QUEM CHAMA, e ela não é opcional: `gravados` significa "o que
 * já foi gravado **para a contagem que está na tela agora**". Assim que o
 * operador MUDA a contagem de um item, aquele item tem de sair da lista — é para
 * isso que existe `esquecerGravado`. Sem isso, uma correção feita depois de
 * registrar some em silêncio: o item continua filtrado aqui, nunca entra no
 * diálogo, nunca chega ao servidor, e o botão diz "Nada a registrar" com uma
 * diferença colorida na tabela. (Achado da revisão adversarial da F31, encontrado
 * por duas lentes independentes.)
 */
export function itensPendentes(
  ajustes: readonly AjusteConferencia[],
  gravados: readonly number[],
): AjusteConferencia[] {
  const feitos = new Set(gravados)
  return ajustes.filter((a) => !feitos.has(a.item_id))
}

/**
 * Tira um item do registro de "já gravado" — o que se faz quando a contagem dele
 * MUDA depois de registrado.
 *
 * Não é redundante com o filtro acima, e sim a outra metade dele: `itensPendentes`
 * responde "o que falta enviar", e esta responde "o que deixou de estar em dia".
 * Existe como função nomeada, e não como um `filter` solto no componente, porque a
 * invariante entre as duas é o ponto exato onde a revisão adversarial achou o furo.
 *
 * Reenviar depois de corrigir NÃO duplica: o saldo do sistema já absorveu o
 * primeiro ajuste, então o novo `diff` é calculado contra o número atualizado e
 * vale exatamente a correção que falta.
 */
export function esquecerGravado(
  gravados: readonly number[],
  itemId: number,
): number[] {
  return gravados.filter((id) => id !== itemId)
}

/** Observação padrão do lote de ajustes — vira a justificativa de CADA linha. */
export function observacaoDeInventario(dataBR: string): string {
  return `Inventário de ${dataBR}`
}

/** Resumo em uma linha, para a barra fixa da tela. */
export function textoResumoConferencia(r: ResumoConferencia): string {
  const n = (v: number) => v.toLocaleString('pt-BR')
  if (r.conferidos === 0) return 'Nada conferido ainda'
  const base = `${n(r.conferidos)} conferido${r.conferidos === 1 ? '' : 's'}`
  if (r.comDiferenca === 0) return `${base} · tudo bate`
  return `${base} · ${n(r.comDiferenca)} com diferença (+${n(r.sobrando)} / −${n(r.faltando)})`
}
