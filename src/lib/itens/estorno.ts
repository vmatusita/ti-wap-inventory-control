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
  if (orig.tipo === 'ajuste') {
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
