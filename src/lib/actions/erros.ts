// Traducao das mensagens de erro do banco (trigger da maquina de estados, 0004,
// e constraints) para pt-BR amigavel. A tabela trigger -> texto vai no resumo da
// OS. O objetivo e nunca vazar mensagem crua do Postgres para a operadora.
export function traduzErroBanco(mensagem: string | undefined | null): string {
  const m = (mensagem ?? '').toLowerCase()

  if (!m) return 'Não foi possível concluir a operação. Tente novamente.'

  // Transicao invalida (raise do status_apos_movimentacao / trigger).
  if (m.includes('invalida para ativo') || m.includes('inválida para ativo')) {
    return 'Transição inválida: o ativo não aceita essa movimentação no estado atual.'
  }
  if (m.includes('ultima movimentacao efetiva') || m.includes('última movimentação efetiva')) {
    return 'Só a última movimentação do ativo pode ser estornada (para casos antigos, use um ajuste com justificativa).'
  }
  if (m.includes('nao pode ser estornada') || m.includes('não pode ser estornada')) {
    return 'Esta movimentação não pode ser estornada.'
  }
  if (m.includes('ajuste exige')) {
    return 'O ajuste exige o status resultante e uma justificativa (observação).'
  }
  if (m.includes('estorno exige')) {
    return 'O estorno precisa apontar para a movimentação de origem.'
  }
  if (m.includes('estorno_de precisa apontar')) {
    return 'A movimentação de origem não pertence a este ativo.'
  }
  // Constraint de unicidade patrimonio + service tag (§5).
  if (m.includes('ativos_patrimonio_service_tag') || m.includes('duplicate key')) {
    return 'Já existe um ativo com esse patrimônio e service tag.'
  }
  // Violacao de FK (motivo/filial inexistente).
  if (m.includes('foreign key') || m.includes('violates foreign key')) {
    return 'Um dos valores informados (motivo ou filial) não existe mais.'
  }
  // Sessao / permissao (RLS).
  if (m.includes('row-level security') || m.includes('permission denied')) {
    return 'Sem permissão para esta operação. Faça login novamente.'
  }

  // Fallback: devolve a mensagem original (util em dev; raro em producao).
  return mensagem ?? 'Não foi possível concluir a operação.'
}
