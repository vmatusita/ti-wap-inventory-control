// Contrato de retorno padrão das Server Actions simples (ok + erro opcional).
// Antes redefinido como AdminResult/ItemActionResult/EditarAtivoResult/
// EstornoResult/CriarSenhaResult — todos idênticos. Actions com retorno rico
// (erros[], criados[], união discriminada) mantêm o próprio tipo.
export type ActionResult = { ok: boolean; erro?: string }

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
  // Itens por quantidade (trigger 0015 → 0027, semântica Total/Estoque F6A).
  // Mantém os textos antigos por compat; adiciona os novos do trigger 0027.
  if (m.includes('estoque insuficiente') || m.includes('saldo insuficiente') || m.includes('saldo negativo')) {
    return 'Estoque insuficiente: a operação deixaria o item com estoque negativo na prateleira.'
  }
  if (m.includes('ajuste inválido') || m.includes('ajuste invalido')) {
    return 'Ajuste inválido: deixaria o item com total negativo.'
  }
  if (
    m.includes('devolução maior') || m.includes('devolucao maior') || m.includes('atrelado aberto') ||
    m.includes('liberação maior') || m.includes('liberacao maior') || m.includes('reserva aberta')
  ) {
    return 'A devolução é maior que a quantidade atrelada ao chamado.'
  }
  if (m.includes('retorno maior') || m.includes('liberado em aberto')) {
    return 'O retorno é maior que a quantidade liberada em aberto.'
  }
  if (m.includes('lanc_item_ajuste_obs')) {
    return 'O ajuste exige uma justificativa (observação).'
  }
  if (m.includes('lanc_item_chamado')) {
    return 'Reserva e liberação exigem o número do chamado.'
  }
  if (m.includes('lanc_item_qtd_valida')) {
    return 'Quantidade inválida para este tipo de lançamento.'
  }
  if (m.includes('itens_nome_uidx')) {
    return 'Já existe um item com esse nome.'
  }
  // Corrida de duplo-estorno: o índice único parcial dispara "duplicate key" —
  // trata ANTES do ramo genérico de duplicidade (senão vazaria a msg de patrimônio).
  if (m.includes('lanc_item_estorna')) {
    return 'Este lançamento já foi estornado.'
  }
  // Constraint de unicidade patrimonio + service tag (§5). SÓ a constraint
  // específica — não presumir que todo "duplicate key" é de patrimônio (há
  // uniques em relatorios_gerados, termos_gerados, filiais, motivos, itens).
  if (m.includes('ativos_patrimonio_service_tag')) {
    return 'Já existe um ativo com esse patrimônio e service tag.'
  }
  // Demais violações de unicidade (corrida de versão de relatório, termo já
  // gerado para o mesmo conjunto etc.): mensagem genérica de recarregar.
  if (m.includes('duplicate key') || m.includes('unique constraint')) {
    return 'Já existe um registro com esses dados. Atualize a página e tente de novo.'
  }
  // Violacao de FK (motivo/filial inexistente).
  if (m.includes('foreign key') || m.includes('violates foreign key')) {
    return 'Um dos valores informados (motivo ou filial) não existe mais.'
  }
  // Sessao / permissao (RLS).
  if (m.includes('row-level security') || m.includes('permission denied')) {
    return 'Sem permissão para esta operação. Faça login novamente.'
  }

  // Fallback: em dev devolve a mensagem crua (debug); em produção NUNCA vaza o
  // texto interno do Postgres para a operadora — mensagem genérica.
  if (process.env.NODE_ENV !== 'production') {
    return mensagem ?? 'Não foi possível concluir a operação.'
  }
  return 'Não foi possível concluir a operação. Tente novamente.'
}
