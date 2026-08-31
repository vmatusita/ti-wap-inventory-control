import type { TipoLancamento } from '@/lib/dominio'

// Inverso de cada tipo na semântica Total/Estoque (F6A §A4). O estorno cria o
// lançamento inverso vinculado (nada se apaga). Regras não triviais:
//   - saida (Liberação) NÃO inverte para entrada (inflaria o Total): vira `retorno`.
//   - retorno inverte para `saida`.
//   - entrada estornada precisa BAIXAR o Total → vira `ajuste` negativo (saida não
//     baixa o total na nova semântica). Observação automática.
//   - reserva↔liberacao mantêm (são inversos: atrelar ↔ devolver).
//   - ajuste inverte o sinal.
const INVERSO: Record<TipoLancamento, TipoLancamento> = {
  entrada: 'ajuste',
  saida: 'retorno',
  reserva: 'liberacao',
  liberacao: 'reserva',
  retorno: 'saida',
  ajuste: 'ajuste',
}

export type LancOriginal = {
  tipo: TipoLancamento
  quantidade: number
  chamado: string | null
  observacao: string | null
  /**
   * F41 — este `ajuste` foi o ACERTO AUTOMÁTICO que a RPC gravou sozinha para que a
   * movimentação do equipamento pudesse ser registrada (coluna `regularizacao`,
   * migration 0125). Muda só o TEXTO do inverso; a aritmética é a mesma de qualquer
   * ajuste (inverte o sinal). Ver a nota longa em `planejarEstorno`.
   */
  regularizacao?: boolean | null
}

export type EstornoPlano = {
  tipo: TipoLancamento
  quantidade: number
  chamado: string | null
  observacao: string | null
}

// ITN-05c — motivo (opcional) do estorno, digitado pelo operador no diálogo.
// Some concatenado como "Estorno: {motivo}" na observação do inverso — nunca
// SUBSTITUINDO o texto automático que já existia para ajuste/entrada.
const PREFIXO_MOTIVO = 'Estorno: '
const TETO_OBSERVACAO = 500

// Calcula o lançamento inverso (puro — sem I/O). O banco valida o saldo do inverso
// e bloqueia estorno duplo (índice único em estorna_id).
//
// `motivo` é OPCIONAL e digitado pelo operador no diálogo de estorno (ITN-05c).
// Antes dele, só ajuste/entrada ganhavam observação automática; com motivo,
// QUALQUER tipo passa a ter observação — o texto automático (quando existe) é
// PRESERVADO e o motivo entra concatenado, nunca no lugar dele.
export function planejarEstorno(orig: LancOriginal, motivo?: string | null): EstornoPlano {
  const tipo = INVERSO[orig.tipo]
  // Só o `ajuste` baixa o Total: entrada→ajuste e ajuste→ajuste invertem o sinal.
  const inverteSinal = orig.tipo === 'entrada' || orig.tipo === 'ajuste'
  const carregaChamado =
    tipo === 'reserva' || tipo === 'liberacao' || tipo === 'retorno' || tipo === 'saida'

  let observacaoAutomatica: string | null = null
  if (orig.tipo === 'ajuste' && orig.regularizacao) {
    // F41 — O INVERSO DO ACERTO AUTOMÁTICO.
    //
    // A ARITMÉTICA não precisou de uma linha nova, e vale dizer por quê: o acerto é
    // um `ajuste` positivo, e `INVERSO['ajuste'] = 'ajuste'` com `inverteSinal`
    // já produz o `ajuste` negativo que o desfaz. A ordem também já estava certa —
    // a 0121 põe o ajuste NEGATIVO por último, depois dos positivos, que é
    // exatamente onde ele tem de entrar para o trigger não recusar por total
    // negativo.
    //
    // O que faltava era o TEXTO. E ele não é enfeite: `estornar_movimentacao_com_itens`
    // (0121) recusa a transação inteira se algum lançamento da movimentação ficar
    // sem estorno — então o acerto automático É estornado, aparece no diário, e um
    // "Estorno de ajuste (…)" genérico faria o operador procurar um ajuste que ele
    // nunca fez. A frase diz que o acerto foi automático e que o estorno o desfaz.
    observacaoAutomatica = `Estorno do acerto automático (${orig.observacao ?? '—'})`
  } else if (orig.tipo === 'ajuste') {
    observacaoAutomatica = `Estorno de ajuste (${orig.observacao ?? '—'})`
  } else if (orig.tipo === 'entrada') {
    observacaoAutomatica = `Estorno de entrada (baixa de ${orig.quantidade} do total)`
  }

  const motivoLimpo = motivo?.trim()
  const observacao = motivoLimpo
    ? observacaoAutomatica
      ? `${observacaoAutomatica} — ${PREFIXO_MOTIVO}${motivoLimpo}`
      : `${PREFIXO_MOTIVO}${motivoLimpo}`
    : observacaoAutomatica

  return {
    tipo,
    quantidade: inverteSinal ? -orig.quantidade : orig.quantidade,
    chamado: carregaChamado ? orig.chamado : null,
    observacao: observacao ? observacao.slice(0, TETO_OBSERVACAO) : null,
  }
}
