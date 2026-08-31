// Escolha do tipo de lançamento — QUATRO botões, uma pergunta só (F41 · decisão J1).
//
// ---------------------------------------------------------------------------
// A HISTÓRIA DESTE ARQUIVO, porque ela explica o formato de agora
// ---------------------------------------------------------------------------
// Ele nasceu na correção avulsa de 19/08/2026, com o feedback do Johnny escrito no
// cabeçalho: "está confuso o controle de itens". O diálogo oferecia os seis tipos
// num select plano — Entrada, Liberação, Atrelar, Devolução, Retorno, Ajuste — e
// três desses nomes eram quase sinônimos no português do balcão. A correção trocou
// o select por DUAS perguntas de operador ("o que aconteceu?" e, quando saiu ou
// voltou, "com quem estava?"), para que o par certo fosse consequência da resposta
// e não memória de vocabulário.
//
// Duas semanas depois a dor voltou (D1/D3 do docs/PLANO-ITENS.md). O diagnóstico:
// **o caminho até o tipo tinha sido consertado; o vocabulário, não.** A segunda
// pergunta existia só para desempatar dois pares que o vocabulário confundia:
//   saida ("Liberação") × reserva ("Atrelar")     — "Saiu como?"
//   retorno ("Retorno") × liberacao ("Devolução") — "De onde voltou?"
//
// A F41 resolveu o vocabulário na raiz: o par reserva/liberacao SAI DA TELA e passa
// a viver só no histórico (`TIPO_LANCAMENTO_META`, decisão J1). Sem ele, não há o
// que desempatar — e a segunda pergunta MORRE. Sobram quatro botões que são as
// palavras do ativo:
//
//   Compra · Saída · Devolução · Ajuste
//
// Quem sabe usar /ativos já sabe o que cada um faz, que é o objetivo inteiro.
//
// ---------------------------------------------------------------------------
// POR QUE `tiposHistoricos` EXISTE (e não é sobra)
// ---------------------------------------------------------------------------
// `tipos` é o que a tela OFERECE — um por grupo, daqui em diante. Mas o histórico
// tem 5 lançamentos de `reserva` em produção e continuará tendo para sempre (o
// acervo não se apaga), e o filtro de tipo do histórico precisa alcançá-los. Por
// isso o grupo guarda também os tipos que COBRE no passado:
//
//   · o filtro de `/itens` lista `tiposHistoricos` (os seis continuam filtráveis);
//   · o diálogo de lançamento lista `tipos` (os quatro que se pode escolher);
//   · `grupoDoTipo` resolve os SEIS, para que "Repetir último" sobre um lançamento
//     antigo de `reserva` acenda um botão em vez de estourar.
//
// Módulo PURO (sem React). O teste trava a coerência com o estorno: o inverso de
// cada tipo oferecido continua sendo um tipo conhecido dos grupos.

import type { TipoLancamento } from '@/lib/dominio'

export type GrupoEscolha = 'chegou' | 'saiu' | 'voltou' | 'acerto'

/** A pergunta do diálogo — a única, desde a F41. */
export const PERGUNTA_ESCOLHA = 'O que aconteceu?'

export type GrupoEscolhaMeta = {
  chave: GrupoEscolha
  /** O texto do botão. Desde a F41 é o RÓTULO OFICIAL do tipo, sem apelido. */
  rotulo: string
  /**
   * A segunda pergunta. **Sempre `null` desde a F41** — o campo permanece porque o
   * diálogo ainda o consulta, e porque zerá-lo é a forma de dizer, no tipo, que a
   * segunda pergunta acabou. Se um dia voltar um grupo com dois tipos oferecidos,
   * é aqui que a pergunta reaparece.
   */
  pergunta: string | null
  /** O(s) tipo(s) que a tela OFERECE neste grupo. Um só, desde a F41. */
  tipos: readonly TipoLancamento[]
  /** Os tipos que o grupo COBRE no histórico — inclui os que saíram da tela. */
  tiposHistoricos: readonly TipoLancamento[]
}

export const GRUPOS_ESCOLHA: readonly GrupoEscolhaMeta[] = [
  {
    chave: 'chegou',
    rotulo: 'Compra',
    pergunta: null,
    tipos: ['entrada'],
    tiposHistoricos: ['entrada'],
  },
  {
    chave: 'saiu',
    rotulo: 'Saída',
    pergunta: null,
    tipos: ['saida'],
    // `reserva` era o "Atrelar": também tirava da prateleira, e é aqui que ela
    // continua encontrável no filtro do histórico.
    tiposHistoricos: ['saida', 'reserva'],
  },
  {
    chave: 'voltou',
    rotulo: 'Devolução',
    pergunta: null,
    tipos: ['retorno'],
    // `liberacao` era a "Devolução" do chamado: também repunha a prateleira.
    tiposHistoricos: ['retorno', 'liberacao'],
  },
  {
    chave: 'acerto',
    rotulo: 'Ajuste',
    pergunta: null,
    tipos: ['ajuste'],
    tiposHistoricos: ['ajuste'],
  },
]

/**
 * A tarefa de cada tipo em linguagem de operador. Com a segunda pergunta morta ele
 * não desempata mais nada, mas continua sendo o texto de apoio do botão e o que a
 * ajuda usa para explicar o efeito de cada tipo — inclusive dos dois que só o
 * histórico mostra.
 */
export const TAREFA_DO_TIPO: Readonly<Record<TipoLancamento, string>> = {
  entrada: 'Compra ou recebimento',
  saida: 'Ficou com uma pessoa',
  reserva: 'Separado para um chamado',
  retorno: 'Estava com uma pessoa e voltou',
  liberacao: 'Estava separado para um chamado e voltou',
  ajuste: 'Corrigir a contagem',
}

/** Lembrete exibido quando o grupo é "Ajuste": o ajuste avulso corrige UMA linha;
 *  contar a prateleira inteira tem tela própria (F31). */
export const DICA_ACERTO_CONFERENCIA =
  'Para contar a prateleira inteira de uma filial, use "Conferir estoque" — ele calcula as diferenças e grava os acertos em lote.'

const POR_TIPO: ReadonlyMap<TipoLancamento, GrupoEscolhaMeta> = new Map(
  GRUPOS_ESCOLHA.flatMap((g) => g.tiposHistoricos.map((t) => [t, g] as const)),
)

/** O grupo a que um tipo pertence — para o diálogo acender o botão certo quando o
 *  tipo chega pronto ("Repetir último", presets). Resolve os SEIS tipos, inclusive
 *  os dois que a tela não oferece mais. */
export function grupoDoTipo(tipo: TipoLancamento): GrupoEscolhaMeta {
  const g = POR_TIPO.get(tipo)
  if (!g) throw new Error(`tipo de lançamento fora dos grupos de escolha: ${tipo}`)
  return g
}

export function grupoPorChave(chave: GrupoEscolha): GrupoEscolhaMeta {
  const g = GRUPOS_ESCOLHA.find((x) => x.chave === chave)
  if (!g) throw new Error(`grupo de escolha desconhecido: ${chave}`)
  return g
}

/** Os tipos que a tela OFERECE, na ordem dos grupos. É a lista dos quatro. */
export const TIPOS_OFERECIDOS: readonly TipoLancamento[] = GRUPOS_ESCOLHA.flatMap(
  (g) => g.tipos,
)

/** Mensagem de validação quando o operador manda salvar sem responder. */
export const MSG_ESCOLHA_TIPO = 'Diga o que aconteceu para escolher o tipo do lançamento'
