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

/**
 * Os três campos do TIPO, zerados.
 *
 * Vale sempre que o tipo cai por INVALIDEZ — nunca por escolha do operador. São quatro
 * caminhos irmãos, e o defeito era o mesmo nos quatro (achado da revisão adversarial da
 * F27, que encontrou os três últimos ainda abertos depois do conserto do primeiro):
 *   1. "repetir última" com um tipo que não serve para o lote atual;
 *   2. `?duplicar=` cujo tipo não vale para o ativo de origem;
 *   3. rascunho que dormiu enquanto outro operador mexia no estado do ativo;
 *   4. ativo acrescentado ao lote que estreita a interseção de tipos.
 * Em todos, o tipo é zerado para o operador escolher outro — e deixar motivo/termo/
 * termoData do tipo ANTIGO no formulário grava algo incoerente e invisível na tela.
 */
export const CAMPOS_DO_TIPO_VAZIOS: CamposDaRepeticao = {
  motivo: '',
  termo: '',
  termoData: '',
}

export function camposDaRepeticao(
  ultima: Pick<UltimaMovimentacaoUsuario, 'motivo' | 'termo_assinado' | 'termo_data'>,
  tipoValido: boolean,
): CamposDaRepeticao {
  // Tipo não vale mais: os três ficam vazios (o toast.warning que o chamador
  // já dispara avisa o operador — aqui é só a decisão de o que NÃO aplicar).
  if (!tipoValido) return { ...CAMPOS_DO_TIPO_VAZIOS }
  return {
    motivo: ultima.motivo ?? '',
    termo: ultima.termo_assinado ?? '',
    termoData: ultima.termo_data ?? '',
  }
}
