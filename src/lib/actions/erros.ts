// Contrato de retorno padrão das Server Actions simples (ok + erro opcional).
// Antes redefinido como AdminResult/ItemActionResult/EditarAtivoResult/
// EstornoResult/CriarSenhaResult — todos idênticos. Actions com retorno rico
// (erros[], criados[], união discriminada) mantêm o próprio tipo.
export type ActionResult = { ok: boolean; erro?: string }

// Traducao das mensagens de erro do banco (trigger da maquina de estados, 0004,
// e constraints) para pt-BR amigavel. A tabela trigger -> texto vai no resumo da
// OS. O objetivo e nunca vazar mensagem crua do Postgres para a operadora.
//
// F7F (17/07/2026): passa a receber TAMBÉM o `code` (SQLSTATE), opcional — os
// demais chamadores seguem chamando `traduzErroBanco(error.message)` sem quebrar.
// Motivo: erros só reconhecíveis pelo SQLSTATE (timeout `57014`) ou por índice
// específico (`23505` do índice parcial do import) caíam no genérico cego. Além
// disso, o fallback agora SEMPRE loga `{ code, mensagem }` no servidor — para o
// próximo erro nunca mais ser diagnosticado às cegas.
export function traduzErroBanco(mensagem: string | undefined | null, code?: string | null): string {
  const m = (mensagem ?? '').toLowerCase()
  const c = (code ?? '').toUpperCase()

  // Timeout de statement (SQLSTATE 57014). O import de startup ("Substituir tudo")
  // roda pela sessão do operador (papel `authenticated`), cujo `statement_timeout`
  // padrão do Supabase é 8s; numa filial cheia + instância Free sob carga, o
  // DELETE+INSERT+conferências podem estourar esse teto e o Postgres cancela com
  // "canceling statement due to statement timeout". Mapeado por code E por
  // substring. (F7F provou em DEV que elevar o teto DENTRO da RPC por
  // `SET statement_timeout` é no-op — não re-arma o timer do statement de topo —,
  // então não há migration; este ramo dá diagnóstico e orienta o retry.) NÃO é a
  // mensagem crua do Postgres — é texto nosso.
  if (c === '57014' || m.includes('statement timeout') || m.includes('canceling statement due to')) {
    return 'A importação demorou demais e foi cancelada — tente novamente ou avise o TI.'
  }

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
  // Import de startup (F7E): índice parcial da service tag quando NÃO há patrimônio.
  // Dois ativos sem patrimônio com a MESMA service tag colidem neste índice (23505).
  // Trata ANTES do ramo genérico de duplicidade e do composto de patrimônio.
  if (m.includes('ativos_service_tag_sem_patrimonio_uidx')) {
    return 'Há dois ativos sem patrimônio com a mesma service tag no plano — a service tag é a identidade quando não há patrimônio. Corrija o CSV e gere o preview novamente.'
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
  // ---- F21: negativa por CARGO / VÍNCULO DE FILIAL ----
  // Antes desta fase existia um ramo só, que devolvia "Sem permissão para esta operação.
  // Faça login novamente." Com papéis, esse conselho passou a MENTIR na maioria dos casos:
  // quem é `consulta`, ou é operador sem a filial vinculada, pode relogar quantas vezes
  // quiser e nada muda — o que ele precisa é falar com um administrador. Os dois primeiros
  // ramos reconhecem as mensagens NOSSAS das guardas internas das RPCs (migration 0064);
  // o terceiro cobre a recusa da própria RLS.
  if (m.includes('apenas administradores')) {
    return 'Esta ação é restrita a administradores.'
  }
  if (m.includes('sem permissao de escrita na filial') || m.includes('sem permissão de escrita na filial')) {
    return 'Você não tem permissão de escrita nesta filial. Fale com um administrador.'
  }
  // ---- F22: negativas das RPCs de GESTÃO DE USUÁRIOS (migrations 0073/0074/0077) ----
  // Elas levantam com errcode 42501 e mensagem NOSSA, já em pt-BR e já dirigida a quem lê.
  // Sem estes ramos, o ramo genérico logo abaixo as engoliria e devolveria "seu cargo ou suas
  // filiais de escrita não permitem" — que, para um ADMINISTRADOR que esbarrou na proteção do
  // cargo Desenvolvedor, é falso (o cargo dele está certo; o que não pode é a AÇÃO) e manda a
  // pessoa investigar a coisa errada. Vêm ANTES do genérico de propósito.
  //
  // O casamento é por substring minúscula, e cada linha cobre a frase SEM acento também
  // porque as mensagens viajam por caminhos diferentes (RPC → PostgREST → supabase-js) e o
  // projeto já teve tradução perdida por acento (ver os pares 'devolução/devolucao' acima).
  // As cinco frases privativas do dev, distinguidas pelo VERBO — assim a tela diz qual ação
  // foi barrada, sem devolver texto cru do banco (regra do fallback logado, no fim do arquivo).
  if (m.includes('só um desenvolvedor') || m.includes('so um desenvolvedor')) {
    if (m.includes('apagar uma conta')) {
      return 'Só um Desenvolvedor pode apagar uma conta de usuário.'
    }
    if (m.includes('encerrar as sessões') || m.includes('encerrar as sessoes')) {
      return 'Só um Desenvolvedor pode encerrar as sessões de um usuário.'
    }
    if (m.includes('apagar o perfil')) {
      return 'Só um Desenvolvedor pode apagar o perfil de outro Desenvolvedor.'
    }
    // 'conceder o cargo' (rede da 0073) e 'gerir o cargo' (guarda da 0074) caem aqui.
    return 'Só um Desenvolvedor pode conceder o cargo Desenvolvedor ou alterar quem já o tem.'
  }
  if (m.includes('restrita ao cargo desenvolvedor')) {
    return 'Esta ação é restrita ao cargo Desenvolvedor.'
  }
  if (m.includes('seu próprio acesso') || m.includes('seu proprio acesso')) {
    return 'Você não pode fazer isso com o seu próprio acesso. Peça a outro administrador.'
  }
  if (m.includes('último administrador ativo') || m.includes('ultimo administrador ativo')) {
    return 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de rebaixar, desativar ou apagar este acesso.'
  }
  if (m.includes('este usuário é um desenvolvedor') || m.includes('este usuario e um desenvolvedor')) {
    return 'Este usuário é um Desenvolvedor: só outro Desenvolvedor pode alterar o cargo, desativar ou apagar esta conta.'
  }

  // ---- F23: as recusas das FERRAMENTAS DESTRUTIVAS (migrations 0081→0086) ----
  // ⚠ ESTES RAMOS PRECISAM VIR ANTES DO GENÉRICO DE 42501 LOGO ABAIXO, e a razão é a mesma
  // que motivou o bloco da F22: as RPCs desta fase recusam com `errcode = 42501` e mensagem
  // NOSSA, mas o motivo NÃO é o cargo de quem chamou — é a AÇÃO que não cabe (não é a última
  // movimentação; existe um termo no caminho; é a única movimentação do ativo). Caindo no
  // genérico, um Desenvolvedor leria "seu cargo ou suas filiais de escrita não permitem" e
  // sairia investigando o próprio acesso, que está perfeito. Mesma armadilha, segunda vez.
  //
  // ⚠ E há uma segunda: as recusas de CONFIRMAÇÃO/JUSTIFICATIVA e a de contagens usam 22023 e
  // 40001, que não têm ramo nenhum — cairiam no fallback genérico e a pessoa não saberia o que
  // digitou de errado. Cada linha cobre a frase COM e SEM acento, pelo motivo já documentado
  // acima (a mensagem viaja RPC → PostgREST → supabase-js).
  if (m.includes('só a última movimentação') || m.includes('so a ultima movimentacao')) {
    return 'Só a última movimentação do ativo pode ser apagada — esta tem outras depois dela. Apague as posteriores primeiro, da mais nova para a mais antiga.'
  }
  if (m.includes('única movimentação do ativo') || m.includes('unica movimentacao do ativo')) {
    return 'Esta é a única movimentação do ativo: apagá-la deixaria um ativo sem nascimento. Use "Apagar ativo", que leva o ativo e o rastro inteiro.'
  }
  if (m.includes('não tem o retrato do estado anterior') || m.includes('nao tem o retrato do estado anterior')) {
    return 'Esta movimentação não guarda o retrato do estado anterior, então não é possível recompor o ativo apagando-a. Use "Forçar estado" e mantenha o histórico.'
  }
  if (m.includes('termo gerado a partir desta movimentação') || m.includes('termo gerado a partir desta movimentacao')) {
    return 'Existe um termo gerado a partir desta movimentação. Apague o termo antes, ou apague o ativo inteiro.'
  }
  if (m.includes('termo que também cobre outros ativos') || m.includes('termo que tambem cobre outros ativos')) {
    return 'Este ativo está num termo que também cobre outros ativos: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou apague antes os outros ativos do mesmo termo.'
  }
  if (m.includes('a confirmação não confere') || m.includes('a confirmacao nao confere')) {
    // A RPC interpola o valor esperado na mensagem, e ele é justamente o que a pessoa precisa
    // ler — mas texto cru do banco não vai para a tela (regra do fallback). A tela já mostra o
    // identificador ao lado do campo, então basta dizer que não bateu.
    return 'A confirmação não confere. Digite exatamente o identificador mostrado ao lado do campo — sem abreviar.'
  }
  if (m.includes('justificativa é obrigatória') || m.includes('justificativa e obrigatoria')) {
    return 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
  }
  if (m.includes('reset sem backup é proibido') || m.includes('reset sem backup e proibido')) {
    return 'Reset sem backup é proibido. Nada foi apagado — gere o backup e tente de novo.'
  }
  if (m.includes('backup informado não existe') || m.includes('backup informado nao existe')) {
    return 'O backup deste reset não foi encontrado no armazenamento. NADA foi apagado — gere a prévia e o backup novamente.'
  }
  if (m.includes('estado mudou desde a prévia') || m.includes('estado mudou desde a previa')) {
    return 'O estado mudou desde a prévia/backup — alguém registrou algo enquanto você confirmava. Nada foi apagado: gere a prévia novamente.'
  }
  if (m.includes('saldo alvo precisa ser')) {
    return 'O saldo alvo precisa ser zero ou maior.'
  }

  // 42501 = insufficient_privilege: cobre tanto "new row violates row-level security
  // policy" (WITH CHECK reprovado) quanto "permission denied for table/column" (o grant de
  // coluna de `profiles`, migration 0063).
  if (c === '42501' || m.includes('row-level security') || m.includes('permission denied')) {
    return 'Sem permissão para esta operação: seu cargo ou suas filiais de escrita não permitem. Se seu acesso mudou agora, recarregue a página; se não, fale com um administrador.'
  }

  // ---- raises P0001 da RPC do import (importar_ativos_substituir) ----
  // São mensagens NOSSAS, já em pt-BR e voltadas ao operador. Mapeamos as que
  // reconhecemos por substring para um texto limpo e estável (sem os valores
  // interpolados que a RPC injeta); o que não reconhecermos cai no fallback
  // LOGADO abaixo (regra CLAUDE.md: nunca vazar texto cru desconhecido).
  if (m.includes('estado da filial mudou')) {
    return 'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.'
  }
  if (m.includes('plano de import vazio')) {
    return 'O plano de import está vazio. Gere o preview novamente.'
  }
  if (m.includes('misturam esta filial com outra') || m.includes('termo(s) gerado')) {
    return 'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.'
  }
  if (m.includes('patrimônio inválido no plano') || m.includes('patrimonio invalido no plano')) {
    return 'Há um patrimônio fora do padrão no plano. Gere o preview novamente.'
  }
  if (
    m.includes('categoria inválida') || m.includes('categoria invalida') ||
    m.includes('estado-alvo inválido') || m.includes('estado-alvo invalido')
  ) {
    return 'Há um valor inválido no plano (categoria ou estado do ativo). Gere o preview novamente.'
  }
  if ((m.includes('duplicado') || m.includes('repetida')) && m.includes('service tag')) {
    return 'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.'
  }
  // Conferências internas da RPC (contagem/estado/colaborador/agregada): a
  // transação já reverteu (tudo-ou-nada), nada foi alterado. Não expõe o detalhe
  // interno — orienta a refazer e avisar o TI se persistir.
  if (m.includes('divergência') || m.includes('divergencia')) {
    return 'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.'
  }

  // Fallback: SEMPRE registra o par { code, mensagem } no servidor — assim o
  // próximo erro deixa de ser cego (F7F). Em dev devolve a mensagem crua (debug);
  // em produção NUNCA vaza o texto interno do Postgres para a operadora.
  console.error('[traduzErroBanco] erro não mapeado', { code: code ?? null, mensagem: mensagem ?? null })
  if (process.env.NODE_ENV !== 'production') {
    return mensagem ?? 'Não foi possível concluir a operação.'
  }
  return 'Não foi possível concluir a operação. Tente novamente.'
}
