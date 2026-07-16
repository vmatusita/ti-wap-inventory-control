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

// Calcula o lançamento inverso (puro — sem I/O). O banco valida o saldo do inverso
// e bloqueia estorno duplo (índice único em estorna_id).
export function planejarEstorno(orig: LancOriginal): EstornoPlano {
  const tipo = INVERSO[orig.tipo]
  // Só o `ajuste` baixa o Total: entrada→ajuste e ajuste→ajuste invertem o sinal.
  const inverteSinal = orig.tipo === 'entrada' || orig.tipo === 'ajuste'
  const carregaChamado =
    tipo === 'reserva' || tipo === 'liberacao' || tipo === 'retorno' || tipo === 'saida'

  let observacao: string | null = null
  if (orig.tipo === 'ajuste') {
    observacao = `Estorno de ajuste (${orig.observacao ?? '—'})`.slice(0, 500)
  } else if (orig.tipo === 'entrada') {
    observacao = `Estorno de entrada (baixa de ${orig.quantidade} do total)`.slice(0, 500)
  }

  return {
    tipo,
    quantidade: inverteSinal ? -orig.quantidade : orig.quantidade,
    chamado: carregaChamado ? orig.chamado : null,
    observacao,
  }
}
