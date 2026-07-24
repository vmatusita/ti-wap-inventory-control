import type { ChipPendencia, ManutencaoCaso } from '@/lib/relatorios/tipos'

// Escalonamento de manutenção parada (F16/T6). Puro e testado.
//
// Um caso ABERTO (não fechado) que já passou de `MANUTENCAO_ALERTA_DIAS` dias em
// manutenção deixa de ser um aviso âmbar de rotina e vira ALERTA (badge vermelho no
// card, para operador E viewer — o card é público) + um chip nas Pendências do
// operador com a contagem (o chip é assunto interno da TI; o viewer não o vê).

// Limiar em dias. Constante nomeada (não número mágico solto na UI).
export const MANUTENCAO_ALERTA_DIAS = 30

type CasoAlertavel = Pick<ManutencaoCaso, 'diasEmManutencao' | 'fechado'>

// Caso aberto parado há ≥ 30 dias. Fechado nunca alerta (já voltou/foi devolvido);
// `diasEmManutencao` nulo (sem envio conhecido) nunca alerta.
export function manutencaoEmAlerta(caso: CasoAlertavel): boolean {
  return (
    !caso.fechado &&
    caso.diasEmManutencao != null &&
    caso.diasEmManutencao >= MANUTENCAO_ALERTA_DIAS
  )
}

// Chip de Pendências "Manutenção parada (30+ dias)" com a contagem, derivado do
// PRÓPRIO array de manutenção (sem tocar em v_pendencias, sem migration). `null`
// quando não há nenhum caso em alerta — a seção não ganha chip vazio.
export function chipManutencaoParada(casos: readonly CasoAlertavel[]): ChipPendencia | null {
  const total = casos.filter(manutencaoEmAlerta).length
  if (total === 0) return null
  return {
    chave: 'manutencao_parada',
    rotulo: `Manutenção parada (${MANUTENCAO_ALERTA_DIAS}+ dias)`,
    total,
  }
}
