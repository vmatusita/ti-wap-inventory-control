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

/** Estoque por item no instante em que a conferência ABRIU — a base congelada. */
export type BaseDaConferencia = Readonly<Record<number, number>>
/** Quanto esta conferência já gravou por item (com sinal), nesta sessão. */
export type EscritoPorItem = Readonly<Record<number, number>>

/**
 * A base congelada, tirada dos saldos na abertura da tela.
 *
 * ⚠ POR QUE CONGELAR, e por que isto é o coração da idempotência (2ª volta da
 * revisão adversarial da F31). A primeira versão calculava o que falta gravar
 * como `contado − estoque ATUAL`, confiando que o `router.refresh()` já tivesse
 * trazido o saldo novo depois de um registro. Não dá para confiar: o `refresh()`
 * é um ida-e-volta de rede que NÃO é esperado pelo `useTransition`, então existe
 * uma janela — dezenas a centenas de milissegundos, e esta tela é usada no
 * corredor, no celular — em que o campo já está reabilitado e `saldos` ainda é o
 * antigo. Corrigir a contagem nessa janela recalculava a diferença contra o
 * número velho e mandava o ajuste INTEIRO de novo: 2 + 3 + 3 = 8 onde o operador
 * contou 5, sem erro nenhum na tela.
 *
 * Com a base congelada a conta deixa de depender de tempo:
 *
 *     falta gravar = (contado − base) − o que esta conferência já gravou
 *
 * Ela é verdadeira antes e depois do refresh chegar, e o mesmo clique repetido
 * nunca escreve duas vezes.
 */
export function baseDaConferencia(saldos: readonly SaldoItem[]): Record<number, number> {
  const base: Record<number, number> = {}
  for (const s of saldos) base[s.item_id] = s.estoque
  return base
}

/**
 * As linhas CONTADAS, na ordem dos saldos (que já vêm ordenados por grupo/ordem).
 * Item que não está em `saldos` é ignorado — a contagem é sempre sobre o catálogo
 * que a tela mostrou.
 *
 * `sistema` é o saldo AO VIVO (é o que a coluna mostra); `diff` é o que ainda
 * FALTA gravar. No estado assentado — refresh chegou — os dois concordam, porque
 * o saldo vivo já é `base + jaEscrito`. Na janela do refresh eles divergem por um
 * instante, e quem manda é o `diff`: é ele que vira lançamento.
 */
export function linhasDaConferencia(
  saldos: readonly SaldoItem[],
  contagens: Readonly<Record<number, string>>,
  base: BaseDaConferencia = {},
  jaEscrito: EscritoPorItem = {},
): LinhaConferencia[] {
  const linhas: LinhaConferencia[] = []
  for (const s of saldos) {
    const contado = contagemDaLinha(contagens[s.item_id])
    if (contado === null) continue
    // ⚠ A BASE CONGELADA VALE SÓ PARA ITEM QUE ESTA SESSÃO JÁ ESCREVEU. Para
    // todos os outros o ponto de partida é o saldo AO VIVO — e isso não é
    // detalhe: a base existe para atravessar a janela do `router.refresh()` das
    // MINHAS escritas, e só. Usá-la em item que eu não toquei faria uma escrita
    // de OUTRA pessoa (outro operador lançando na mesma filial enquanto conto)
    // ser contada de novo por cima, criando unidades fantasmas. Com esta regra,
    // item que ninguém desta sessão mexeu enxerga sempre o número corrente.
    //
    // Item que apareceu no catálogo depois da abertura também cai no vivo, que
    // para ele é a primeira leitura de qualquer forma.
    //
    // ⚠ O RESÍDUO, declarado: se eu JÁ gravei aquele item E outra pessoa também
    // mexer nele, o meu ajuste seguinte não enxerga a mexida dela. Fechar isso de
    // verdade é matéria de SERVIDOR (um "ajustar para N" ou uma chave de
    // idempotência), fora do escopo da F31 — está no relatório e no backlog.
    const escrito = jaEscrito[s.item_id] ?? 0
    const partida = escrito !== 0 ? (base[s.item_id] ?? s.estoque) : s.estoque
    linhas.push({
      itemId: s.item_id,
      item: s.item,
      sistema: s.estoque,
      contado,
      diff: contado - partida - escrito,
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

/**
 * Só as divergências viram ajuste. Linha que bateu não gera lançamento nenhum.
 *
 * Como `diff` já é "o que FALTA gravar" (base congelada menos o que esta sessão
 * escreveu), esta lista é exatamente o pendente: reenviar depois de um envio
 * parcial manda só o que falta, e clicar duas vezes na mesma tela não escreve
 * duas vezes.
 */
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
 * Soma o que acabou de ser gravado ao registro da sessão.
 *
 * É a outra metade da base congelada: `baseDaConferencia` diz de onde se partiu,
 * e este acumulador diz o quanto esta conferência já andou. Juntos, `diff` é
 * sempre "o que ainda falta", sem depender de o saldo do servidor já ter chegado.
 *
 * Acumula (`+=`) em vez de sobrescrever, de propósito: um item pode ser corrigido
 * e regravado várias vezes na mesma sessão, e é a SOMA do que foi escrito que
 * precisa sair da conta.
 */
export function somarEscrito(
  jaEscrito: EscritoPorItem,
  gravadosAgora: readonly AjusteConferencia[],
): Record<number, number> {
  const novo: Record<number, number> = { ...jaEscrito }
  for (const a of gravadosAgora) {
    novo[a.item_id] = (novo[a.item_id] ?? 0) + a.quantidade
  }
  return novo
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
