// Escolha guiada do tipo de lançamento (correção avulsa de 19/08/2026 —
// feedback do Johnny: "está confuso o controle de itens").
//
// O PROBLEMA QUE ESTE MÓDULO RESOLVE. O diálogo de lançamento oferecia os seis
// tipos num select plano — Entrada, Liberação, Atrelar, Devolução, Retorno,
// Ajuste — e três desses nomes são quase sinônimos no português do balcão.
// A regra que importa (Liberação volta por Retorno; Atrelar volta por
// Devolução) ficava só na ajuda, e a própria ajuda admitia: escolher o par
// errado "embaralha a coluna Atrelados — e é a causa mais comum de a coluna
// Falta acender". A escolha passa a ser feita em DUAS perguntas de operador
// ("o que aconteceu?" e, quando saiu/voltou, "com quem estava?") — o par certo
// é consequência da resposta, não memória de vocabulário.
//
// OS RÓTULOS OFICIAIS NÃO MUDAM. A reconciliação de rótulos da F6A §A4
// (decisão do Johnny, 16/07/2026 — `TIPO_LANCAMENTO_META`) continua valendo em
// pill, histórico, filtros e relatório; este módulo só organiza o CAMINHO até
// o tipo. Módulo PURO (sem React): serve ao diálogo de lançamento e ao
// agrupamento do filtro de tipo do histórico, e o teste trava a coerência com
// o estorno (o inverso de cada tipo de "saiu" é o tipo de "voltou" da MESMA
// resposta — mesma posição nos dois grupos).

import type { TipoLancamento } from '@/lib/dominio'

export type GrupoEscolha = 'chegou' | 'saiu' | 'voltou' | 'acerto'

/** A primeira pergunta do diálogo. */
export const PERGUNTA_ESCOLHA = 'O que aconteceu?'

export type GrupoEscolhaMeta = {
  chave: GrupoEscolha
  /** O texto do botão da primeira pergunta. */
  rotulo: string
  /** A segunda pergunta — só nos grupos com dois tipos. */
  pergunta: string | null
  /** Os tipos do grupo, NA MESMA ORDEM nos grupos espelhados: a posição 0 de
   *  "saiu" e de "voltou" é a resposta "pessoa"; a posição 1, "chamado". */
  tipos: readonly TipoLancamento[]
}

export const GRUPOS_ESCOLHA: readonly GrupoEscolhaMeta[] = [
  { chave: 'chegou', rotulo: 'Chegou', pergunta: null, tipos: ['entrada'] },
  {
    chave: 'saiu',
    rotulo: 'Saiu da prateleira',
    pergunta: 'Saiu como?',
    tipos: ['saida', 'reserva'],
  },
  {
    chave: 'voltou',
    rotulo: 'Voltou à prateleira',
    pergunta: 'De onde voltou?',
    tipos: ['retorno', 'liberacao'],
  },
  { chave: 'acerto', rotulo: 'Acerto de contagem', pergunta: null, tipos: ['ajuste'] },
]

/** A resposta da segunda pergunta, em linguagem de tarefa — o que o operador
 *  vê no botão. O rótulo OFICIAL (Liberação, Atrelar…) aparece junto, miúdo,
 *  para a ponte com o histórico e o relatório se fazer sozinha. */
export const TAREFA_DO_TIPO: Readonly<Record<TipoLancamento, string>> = {
  entrada: 'Compra ou recebimento',
  saida: 'Ficou com uma pessoa',
  reserva: 'Atrelado a um chamado',
  retorno: 'Estava com uma pessoa',
  liberacao: 'Estava atrelado a um chamado',
  ajuste: 'Corrigir a contagem',
}

/** Lembrete exibido quando o grupo é "Acerto de contagem": o ajuste avulso
 *  corrige UMA linha; contar a prateleira inteira tem tela própria (F31). */
export const DICA_ACERTO_CONFERENCIA =
  'Para contar a prateleira inteira de uma filial, use "Conferir estoque" — ele calcula as diferenças e grava os acertos em lote.'

const POR_TIPO: ReadonlyMap<TipoLancamento, GrupoEscolhaMeta> = new Map(
  GRUPOS_ESCOLHA.flatMap((g) => g.tipos.map((t) => [t, g] as const)),
)

/** O grupo a que um tipo pertence — para o diálogo acender o botão certo
 *  quando o tipo chega pronto ("Repetir último", presets). */
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

/** Mensagem de validação quando o operador manda salvar sem responder. */
export const MSG_ESCOLHA_TIPO = 'Diga o que aconteceu para escolher o tipo do lançamento'
