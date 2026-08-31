// A PARTIÇÃO DA QUANTIDADE e os textos do acerto automático (F41 · decisão J2).
//
// ---------------------------------------------------------------------------
// A REGRA, UMA SÓ
// ---------------------------------------------------------------------------
// O sistema nunca recusa um lançamento de item por falta de saldo dentro de uma
// movimentação de ativo. Ele parte a quantidade em duas: a parte que o diário já
// conhecia vira o lançamento normal; a parte que ele não conhecia vira um acerto de
// contagem com justificativa automática, marcado `regularizacao` (coluna da 0125).
//
// ---------------------------------------------------------------------------
// ⚠ ONDE ESTA CONTA VALE, E ONDE ELA **NÃO** VALE
// ---------------------------------------------------------------------------
// Quem DECIDE a partição é o Postgres, dentro da RPC, depois das travas — nunca
// esta função. Está escrito no cabeçalho da 0126 e vale repetir: entre ler o saldo
// no servidor e gravar, outra sessão pode mexer no mesmo par; a partição sairia
// errada, o trigger recusaria e o lote morreria de novo, pelo mesmo motivo que a
// F41 existe para consertar.
//
// Esta função é a MESMA conta, em TypeScript, para dois usos honestos:
//   · a tela PREVER o que vai acontecer e dizer antes de gravar (a prévia da F42);
//   · o teste provar a aritmética caso a caso, sem subir banco.
// Se a previsão daqui divergir do que a RPC gravou, quem tem razão é a RPC.
//
// ---------------------------------------------------------------------------
// A OBSERVAÇÃO É QUE VEM DAQUI — e essa parte não é opcional
// ---------------------------------------------------------------------------
// A RPC desta casa NÃO REDIGE TEXTO (regra do cabeçalho da 0117), e o CHECK
// `lanc_item_ajuste_obs` (0015) exige justificativa não vazia em TODO ajuste. Logo,
// o acerto automático só pode ser gravado se a aplicação mandar a frase pronta na
// chave `observacao_regularizacao` do payload. Se ela faltar, a RPC recusa com
// "O acerto automático deste item precisa de uma justificativa." — por isso as
// actions mandam SEMPRE, mesmo quando a partição provavelmente não vai precisar:
// o custo de mandar à toa é uma string; o de não mandar é o lote recusado, que é
// exatamente o que esta fase acabou.

import type { TipoLancamento } from '@/lib/dominio'

/** Teto de `lancamentos_item.observacao` (0015 e o Zod de item). */
const TETO_OBSERVACAO = 500

/** O começo do texto — é por ele que o histórico e o selo se reconhecem. */
export const PREFIXO_REGULARIZACAO = 'Acerto automático'

/** Os dois únicos tipos que a partição toca. Os demais passam inteiros. */
const PARTICIONAVEIS: readonly TipoLancamento[] = ['retorno', 'saida']

export type SaldoDoPar = {
  /** `A` — em uso em aberto do par (Σ saída − Σ devolução), com piso em zero. */
  emUso: number
  /** `E` — em estoque do par (total − reservado − máx(0, em uso)). */
  emEstoque: number
}

export type Particao = {
  /** A quantidade do lançamento normal. Zero significa "não grave a linha". */
  normal: number
  /** A quantidade do `ajuste` de regularização. Zero significa "não grave". */
  regularizacao: number
}

/**
 * Parte a quantidade entre o lançamento normal e o acerto automático.
 *
 * `retorno` de `q`: devolve `normal = mín(q, A)` e `regularizacao = q − normal`.
 *   Quando `A = 0` é uma linha só — o acerto — e é o caso do print.
 * `saida` de `q`: devolve `normal = q` (a saída sai INTEIRA) e
 *   `regularizacao = máx(0, q − E)` (o acerto só repõe o que faltava na prateleira).
 * Qualquer outro tipo passa inteiro, sem acerto.
 *
 * Espelha, expressão por expressão, o que a 0126 faz dentro da transação.
 */
export function partirQuantidade(
  tipo: TipoLancamento,
  quantidade: number,
  saldo: SaldoDoPar,
): Particao {
  if (!PARTICIONAVEIS.includes(tipo) || !Number.isFinite(quantidade) || quantidade <= 0) {
    return { normal: quantidade, regularizacao: 0 }
  }
  if (tipo === 'retorno') {
    // `greatest(0, …)` do SQL: um `em uso` negativo (mais devolução que saída no
    // histórico) não vira crédito, vira zero.
    const aberto = Math.max(0, saldo.emUso)
    const normal = Math.min(quantidade, aberto)
    return { normal, regularizacao: quantidade - normal }
  }
  return { normal: quantidade, regularizacao: Math.max(0, quantidade - saldo.emEstoque) }
}

/** De onde veio o lançamento — muda só a frase, nunca a aritmética. */
export type OrigemDoAcerto =
  /** O checklist "Voltou" da devolução, ou o lançamento avulso de devolução. */
  | 'devolucao'
  /** "Itens que vão junto" da entrega, ou o lançamento avulso de saída. */
  | 'entrega'
  /** "Item recuperado" na mesa de pendências. */
  | 'pendencia'

export type ContextoAcerto = {
  /** O nome do item, do jeito que o catálogo o guarda. Opcional. */
  itemRotulo?: string | null
  /** Quantas unidades entram por acerto (a `regularizacao` da partição). */
  quantidade: number
  /** O nome de quem devolveu ou recebeu, quando houver. */
  colaborador?: string | null
}

/**
 * A justificativa do `ajuste` de regularização. NUNCA devolve vazio — o CHECK do
 * banco não aceitaria, e a mensagem de recusa seria pior que o texto padrão.
 *
 * O texto diz O QUE ACONTECEU e POR QUE o número mudou, para quem ler o diário daqui
 * a um ano entender sem reconstruir a movimentação: é essa visibilidade que impede o
 * acerto automático de virar desculpa para inventar estoque.
 */
export function textoDaRegularizacao(
  origem: OrigemDoAcerto,
  ctx: ContextoAcerto,
): string {
  const item = ctx.itemRotulo?.trim() || 'item'
  const n = Math.max(1, Math.trunc(ctx.quantidade))
  const unidade = n === 1 ? '1 unidade' : `${n} unidades`
  const pessoa = ctx.colaborador?.trim()

  const frase =
    origem === 'entrega'
      ? `${PREFIXO_REGULARIZACAO}: ${unidade} de ${item} entrou no acervo porque saiu com o equipamento` +
        `${pessoa ? ` para ${pessoa}` : ''} e a filial não tinha essa quantidade em estoque.`
      : origem === 'pendencia'
        ? `${PREFIXO_REGULARIZACAO}: ${unidade} de ${item} entrou no acervo ao ser recuperada na mesa de pendências` +
          `${pessoa ? ` (estava com ${pessoa})` : ''} — não havia saída registrada para dar baixa.`
        : `${PREFIXO_REGULARIZACAO}: ${unidade} de ${item} entrou no acervo porque voltou com o equipamento` +
          `${pessoa ? ` de ${pessoa}` : ''} e não havia saída registrada.`

  return frase.slice(0, TETO_OBSERVACAO)
}

/**
 * A linha que o painel de sucesso e o toast dizem, em UMA frase, sobre o que foi
 * regularizado — a mesma discrição com que a F38 avisa sobre o vínculo da pessoa.
 * Devolve `null` quando não houve acerto nenhum: nesse caso a tela não diz nada.
 */
export function avisoDeRegularizacao(unidades: number, linhas: number): string | null {
  if (!Number.isFinite(unidades) || unidades <= 0 || linhas <= 0) return null
  const u = Math.trunc(unidades)
  const acessorios =
    linhas === 1 ? (u === 1 ? '1 item' : `${u} unidades de 1 item`) : `${u} unidades de ${linhas} itens`
  return `${acessorios} ${u === 1 && linhas === 1 ? 'entrou' : 'entraram'} no estoque por acerto automático — não estavam no sistema.`
}
