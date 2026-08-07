// Decisão pura de "repetir última" no passo 2 da nova movimentação (MOV-07).
// Sem React — a regra é a mesma que `repetirUltima` (nova-movimentacao-form)
// aplica e que os testes exercitam.
//
// `motivo`/`termo`/`termoData` são específicos do TIPO (CAMPOS_POR_TIPO /
// `aplica_a`): quando o tipo da última movimentação não vale mais para os
// ativos do lote atual (`tipoValido === false`), o tipo NÃO é trocado (o
// operador escolhe outro) — mas aplicar esses três campos do tipo antigo
// grava algo incoerente e invisível na tela (o Zod só exige `motivo.min(1)`,
// sem checar `aplica_a`, e não há checagem equivalente na action nem no
// banco). Os demais campos (colaborador, setor, chamado) não dependem do
// tipo — sobrevivem sempre, tipo válido ou não.
import type { TermoStatus } from '@/lib/dominio'
import type { UltimaMovimentacaoUsuario } from '@/lib/queries/movimentacoes'

export type CamposDaRepeticao = {
  motivo: string
  termo: '' | TermoStatus
  termoData: string
}

export function camposDaRepeticao(
  ultima: Pick<UltimaMovimentacaoUsuario, 'motivo' | 'termo_assinado' | 'termo_data'>,
  tipoValido: boolean,
): CamposDaRepeticao {
  // Tipo não vale mais: os três ficam vazios (o toast.warning que o chamador
  // já dispara avisa o operador — aqui é só a decisão de o que NÃO aplicar).
  if (!tipoValido) return { motivo: '', termo: '', termoData: '' }
  return {
    motivo: ultima.motivo ?? '',
    termo: ultima.termo_assinado ?? '',
    termoData: ultima.termo_data ?? '',
  }
}
