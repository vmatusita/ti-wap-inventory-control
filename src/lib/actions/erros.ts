import { MSG_CHAMADO_OBRIGATORIO } from '@/lib/validators/item'
import { registrarFalha } from '@/lib/observabilidade'
import { casa, casaConstraint, FRASES_DO_MOTOR, MSG_SQL } from '@/lib/supabase/erros-do-banco'

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
//
// F58: nenhuma frase é mais escrita aqui. Cada ramo casa por NOME — `MSG_SQL.<ramo>`,
// `CONSTRAINTS_TRADUZIDAS` ou `FRASES_DO_MOTOR`, em `src/lib/supabase/erros-do-banco.ts` —, e
// `erros-do-banco-sql.test.ts` confere cada frase contra o corpo VIVO das funções e cada nome
// contra o esquema vivo. A migration que reescrever um `raise` derruba o `npm run test` nomeando o
// ramo, em vez de mandar o operador para o genérico em silêncio. `casamento-por-texto.test.ts`
// reprova um `m.includes('texto solto')` que volte a nascer neste arquivo. A ORDEM dos ramos é a
// mesma de antes, e continua sendo a semântica: o ramo específico vem antes do genérico.
export function traduzErroBanco(mensagem: string | undefined | null, code?: string | null): string {
  const m = mensagem ?? ''
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
  if (c === '57014' || casa(m, FRASES_DO_MOTOR.timeout)) {
    return 'A importação demorou demais e foi cancelada — tente novamente ou avise o TI.'
  }

  // Transicao invalida (raise do status_apos_movimentacao / trigger).
  if (casa(m, MSG_SQL.transicaoInvalida)) {
    return 'Transição inválida: o ativo não aceita essa movimentação no estado atual.'
  }
  if (casa(m, MSG_SQL.estornoForaDaUltima)) {
    return 'Só a última movimentação do ativo pode ser estornada (para casos antigos, use um ajuste com justificativa).'
  }
  if (casa(m, MSG_SQL.naoPodeSerEstornada)) {
    return 'Esta movimentação não pode ser estornada.'
  }
  if (casa(m, MSG_SQL.ajusteExige)) {
    return 'O ajuste exige o status resultante e uma justificativa (observação).'
  }
  if (casa(m, MSG_SQL.estornoExige)) {
    return 'O estorno precisa apontar para a movimentação de origem.'
  }
  if (casa(m, MSG_SQL.estornoDeForaDoAtivo)) {
    return 'A movimentação de origem não pertence a este ativo.'
  }
  // Itens por quantidade (trigger 0015 → 0027 → 0118, semântica Total/Estoque F6A).
  // F58: saíram as frases que só a 0015/0019/0024 escreviam ("saldo insuficiente",
  // "liberação maior", "reserva aberta") e "saldo negativo", que nenhum SQL escreveu —
  // nenhum corpo vivo as emite mais, e o teste contra o SQL vivo reprovaria a lista com elas.
  if (casa(m, MSG_SQL.estoqueInsuficiente)) {
    return 'Estoque insuficiente: a operação deixaria o item com estoque negativo na prateleira.'
  }
  if (casa(m, MSG_SQL.ajusteInvalido)) {
    return 'Ajuste inválido: deixaria o item com total negativo.'
  }
  if (casa(m, MSG_SQL.devolucaoMaiorQueReserva)) {
    // F41 — "reservada PARA o chamado", não "atrelada AO chamado": o rótulo do tipo
    // deixou de ser "Atrelar" e passou a ser "Reserva". A frase tem de acompanhar,
    // senão manda o operador procurar na tela um botão que não existe mais.
    // ⚠ Esta frase é espelhada à mão em `ajuda/conteudo/mensagens-de-erro.ts`, e
    // `referencia.test.ts` compara as duas. Mudou aqui, mude lá NO MESMO COMMIT.
    return 'A devolução é maior que a quantidade reservada para o chamado.'
  }
  if (casa(m, MSG_SQL.retornoMaiorQueEmAberto)) {
    // F41 — a mensagem sobrevive para o LANÇAMENTO AVULSO fora de movimentação e
    // para payload forjado. Dentro de uma movimentação de equipamento ela não
    // aparece mais: a RPC parte a quantidade e regulariza o excedente (0126).
    return 'A devolução é maior que a quantidade que ainda está com as pessoas.'
  }
  if (casaConstraint(m, 'lanc_item_ajuste_obs')) {
    return 'O ajuste exige uma justificativa (observação).'
  }
  if (casa(m, MSG_SQL.acertoAutomatico)) {
    // F41 — a RPC recusa quando precisaria regularizar e a aplicação não mandou a
    // justificativa pronta em `observacao_regularizacao` (a RPC não redige texto).
    // É bug de chamador, não erro de operador: a frase diz o que dá para fazer.
    return 'Não consegui registrar o acerto automático deste item. Tente de novo; se repetir, lance o item pela tela de Itens e registre a movimentação em seguida.'
  }
  if (casaConstraint(m, 'lanc_item_chamado')) {
    // 19/08/2026 (avulsa) — a MESMA frase do Zod (`MSG_CHAMADO_OBRIGATORIO`), que
    // fala os rótulos DA TELA. F41: os rótulos viraram "Reserva" e "Devolução de
    // reserva", e os dois tipos saíram da tela — esta recusa só alcança lançamento
    // antigo ou payload forjado. A constante continua sendo a fonte única.
    return `${MSG_CHAMADO_OBRIGATORIO}.`
  }
  if (casaConstraint(m, 'lanc_item_qtd_valida')) {
    return 'Quantidade inválida para este tipo de lançamento.'
  }
  // Os DOIS índices únicos do catálogo. `itens_nome_uidx` (lower(nome)) é o antigo;
  // `itens_nome_chave_uidx` (0125) é o novo e é ESTRITAMENTE mais forte — ignora
  // acento e espaço a mais além da caixa. Qualquer um dos dois pode ser o que
  // dispara, então os dois traduzem para a mesma frase.
  if (casaConstraint(m, 'itens_nome_uidx', 'itens_nome_chave_uidx')) {
    return 'Já existe um item com esse nome (a comparação ignora acento, maiúscula e espaço a mais). Use o item que já existe.'
  }
  // Corrida de duplo-estorno: o índice único parcial dispara "duplicate key" —
  // trata ANTES do ramo genérico de duplicidade (senão vazaria a msg de patrimônio).
  // F58: casa pelo nome INTEIRO do índice (0015); até aqui casava o prefixo `lanc_item_estorna`.
  if (casaConstraint(m, 'lanc_item_estorna_uidx')) {
    return 'Este lançamento já foi estornado.'
  }
  // Import de startup (F7E): índice parcial da service tag quando NÃO há patrimônio.
  // Dois ativos sem patrimônio com a MESMA service tag colidem neste índice (23505).
  // Trata ANTES do ramo genérico de duplicidade e do composto de patrimônio.
  // ⚠ F24: os NOMES dos dois índices foram PRESERVADOS na migration 0091 justamente para
  // estes dois ramos continuarem casando — o que mudou foi o alcance (agora por filial),
  // e portanto o TEXTO. Renomear os índices mataria a tradução — desde a F58, com teste.
  if (casaConstraint(m, 'ativos_service_tag_sem_patrimonio_uidx')) {
    return 'Já existe um ativo sem patrimônio com essa service tag nesta filial — a service tag é a identidade quando não há patrimônio.'
  }
  // Constraint de unicidade patrimonio + service tag (§5). SÓ a constraint
  // específica — não presumir que todo "duplicate key" é de patrimônio (há
  // uniques em relatorios_gerados, termos_gerados, filiais, motivos, itens).
  // F58: casa pelo nome INTEIRO (0003 → 0091); até aqui casava o prefixo.
  if (casaConstraint(m, 'ativos_patrimonio_service_tag_uidx')) {
    return 'Já existe um ativo com esse patrimônio e service tag nesta filial.'
  }
  // ---- F56: o vocabulário de unidades (nome de filial × apelido, migration 0139) ----
  // Backstop de corrida das Decisões 1/2/13 do PLAN-F56 — a pré-checagem em
  // `src/lib/unidades/dono-do-termo.ts` já nomeia a filial dona ANTES de escrever
  // (em `criarFilial`/`atualizarFilial` e em `incluirApelidoUnidade`); estes dois
  // ramos só cobrem o caso raro de dois admins colidindo ao mesmo tempo, com uma
  // frase GENÉRICA — nunca extraindo o nome dinâmico da mensagem do banco (não há
  // precedente neste arquivo para isso, e não é este ramo que abre o primeiro).
  if (casaConstraint(m, 'filiais_nome_chave_uidx')) {
    return 'Já existe uma filial com este nome (a comparação ignora acento, maiúscula e espaço a mais). Atualize a página e tente de novo.'
  }
  if (casaConstraint(m, 'unidades_apelidos_apelido_chave_uidx')) {
    return 'Este apelido já está cadastrado para alguma filial. Atualize a página e tente de novo.'
  }
  // Demais violações de unicidade (corrida de versão de relatório, termo já
  // gerado para o mesmo conjunto etc.): mensagem genérica de recarregar.
  if (casa(m, FRASES_DO_MOTOR.unicidade)) {
    return 'Já existe um registro com esses dados. Atualize a página e tente de novo.'
  }
  // Violacao de FK (motivo/filial inexistente).
  if (casa(m, FRASES_DO_MOTOR.chaveEstrangeira)) {
    return 'Um dos valores informados (motivo ou filial) não existe mais.'
  }
  // ---- F21: negativa por CARGO / VÍNCULO DE FILIAL ----
  // Antes desta fase existia um ramo só, que devolvia "Sem permissão para esta operação.
  // Faça login novamente." Com papéis, esse conselho passou a MENTIR na maioria dos casos:
  // quem é `consulta`, ou é operador sem a filial vinculada, pode relogar quantas vezes
  // quiser e nada muda — o que ele precisa é falar com um administrador. Os dois primeiros
  // ramos reconhecem as mensagens NOSSAS das guardas internas das RPCs (migration 0064);
  // o terceiro cobre a recusa da própria RLS.
  if (casa(m, MSG_SQL.apenasAdministradores)) {
    return 'Esta ação é restrita a administradores.'
  }
  if (casa(m, MSG_SQL.semEscritaNaFilial)) {
    return 'Você não tem permissão de escrita nesta filial. Fale com um administrador.'
  }
  // ---- F22: negativas das RPCs de GESTÃO DE USUÁRIOS (migrations 0073/0074/0077) ----
  // Elas levantam com errcode 42501 e mensagem NOSSA, já em pt-BR e já dirigida a quem lê.
  // Sem estes ramos, o ramo genérico logo abaixo as engoliria e devolveria "seu cargo ou suas
  // filiais de escrita não permitem" — que, para um ADMINISTRADOR que esbarrou na proteção do
  // cargo Desenvolvedor, é falso (o cargo dele está certo; o que não pode é a AÇÃO) e manda a
  // pessoa investigar a coisa errada. Vêm ANTES do genérico de propósito.
  //
  // O casamento é por substring minúscula, e cada ramo de `MSG_SQL` cobre a frase SEM acento também
  // porque as mensagens viajam por caminhos diferentes (RPC → PostgREST → supabase-js) e o
  // projeto já teve tradução perdida por acento (ver os pares 'devolução/devolucao' da lista).
  // As cinco frases privativas do dev, distinguidas pelo VERBO — assim a tela diz qual ação
  // foi barrada, sem devolver texto cru do banco (regra do fallback logado, no fim do arquivo).
  if (casa(m, MSG_SQL.soUmDesenvolvedor)) {
    if (casa(m, MSG_SQL.apagarUmaConta)) {
      return 'Só um Desenvolvedor pode apagar uma conta de usuário.'
    }
    if (casa(m, MSG_SQL.encerrarAsSessoes)) {
      return 'Só um Desenvolvedor pode encerrar as sessões de um usuário.'
    }
    if (casa(m, MSG_SQL.apagarOPerfil)) {
      return 'Só um Desenvolvedor pode apagar o perfil de outro Desenvolvedor.'
    }
    // 'conceder o cargo' (rede da 0073) e 'gerir o cargo' (guarda da 0074) caem aqui.
    return 'Só um Desenvolvedor pode conceder o cargo Desenvolvedor ou alterar quem já o tem.'
  }
  if (casa(m, MSG_SQL.restritaAoDesenvolvedor)) {
    return 'Esta ação é restrita ao cargo Desenvolvedor.'
  }
  if (casa(m, MSG_SQL.proprioAcesso)) {
    return 'Você não pode fazer isso com o seu próprio acesso. Peça a outro administrador.'
  }
  if (casa(m, MSG_SQL.ultimoAdministrador)) {
    return 'Este é o último administrador ativo do sistema. Promova outra pessoa antes de rebaixar, desativar ou apagar este acesso.'
  }
  if (casa(m, MSG_SQL.usuarioEDesenvolvedor)) {
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
  // digitou de errado. Cada ramo cobre a frase COM e SEM acento, pelo motivo já documentado
  // acima (a mensagem viaja RPC → PostgREST → supabase-js).
  // ⚠ ESTE RAMO É O MAIS PROVÁVEL DE TODOS OS DA F23, e ele quase ficou de fora: a recusa de
  // EMPATE (0087) dispara para todo ativo que veio do import de startup — 1111 dos 1232 do
  // acervo de produção. Sem tradução, ela cairia no genérico de 42501 logo abaixo e diria a um
  // Desenvolvedor que "seu cargo ou suas filiais de escrita não permitem", que é falso e manda
  // investigar a coisa errada. Vem ANTES dos demais porque é o caso comum.
  if (casa(m, MSG_SQL.movimentacoesNoMesmoInstante)) {
    return 'Este ativo tem movimentações gravadas no mesmo instante (é o caso dos que vieram do import de startup), então não dá para dizer com segurança qual é a última. Para desmontá-lo, use "Apagar ativo", que leva o rastro inteiro.'
  }
  if (casa(m, MSG_SQL.soAUltimaMovimentacao)) {
    return 'Só a última movimentação do ativo pode ser apagada — esta tem outras depois dela. Apague as posteriores primeiro, da mais nova para a mais antiga.'
  }
  if (casa(m, MSG_SQL.unicaMovimentacao)) {
    return 'Esta é a única movimentação do ativo: apagá-la deixaria um ativo sem nascimento. Use "Apagar ativo", que leva o ativo e o rastro inteiro.'
  }
  if (casa(m, MSG_SQL.semRetratoAnterior)) {
    return 'Esta movimentação não guarda o retrato do estado anterior, então não é possível recompor o ativo apagando-a. Use "Forçar estado" e mantenha o histórico.'
  }
  if (casa(m, MSG_SQL.termoDaMovimentacao)) {
    return 'Existe um termo gerado a partir desta movimentação. Apague o termo antes, ou apague o ativo inteiro.'
  }
  if (casa(m, MSG_SQL.termoDeOutrosAtivos)) {
    return 'Este ativo está num termo que também cobre outros ativos: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou apague antes os outros ativos do mesmo termo.'
  }
  if (casa(m, MSG_SQL.confirmacaoNaoConfere)) {
    // A RPC interpola o valor esperado na mensagem, e ele é justamente o que a pessoa precisa
    // ler — mas texto cru do banco não vai para a tela (regra do fallback). A tela já mostra o
    // identificador ao lado do campo, então basta dizer que não bateu.
    return 'A confirmação não confere. Digite exatamente o identificador mostrado ao lado do campo — sem abreviar.'
  }
  if (casa(m, MSG_SQL.justificativaObrigatoria)) {
    return 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
  }
  if (casa(m, MSG_SQL.resetSemBackup)) {
    return 'Reset sem backup é proibido. Nada foi apagado — gere o backup e tente de novo.'
  }
  if (casa(m, MSG_SQL.backupDoResetInexistente)) {
    return 'O backup deste reset não foi encontrado no armazenamento. NADA foi apagado — gere a prévia e o backup novamente.'
  }
  if (casa(m, MSG_SQL.estadoMudouDesdeAPrevia)) {
    return 'O estado mudou desde a prévia/backup — alguém registrou algo enquanto você confirmava. Nada foi apagado: gere a prévia novamente.'
  }
  // ---- F52: as recusas NOVAS do import de startup e das guardas de escopo ----
  //
  // ⚠ TODAS as frases abaixo são LEXICALMENTE DISJUNTAS das que já existem neste arquivo,
  // e isso é requisito, não coincidência. A mais perigosa é a do backup: o ramo do RESET
  // (mais acima) casa "backup informado não existe" e responde com instruções de OUTRA
  // ferramenta — "gere a prévia novamente", e o import não tem prévia de reset. Por isso a
  // RPC do import diz "o backup deste import não foi encontrado", que não é capturado por
  // ramo nenhum anterior. Há teste provando que o texto que chega ao operador do import
  // NÃO fala em "deste reset".
  if (casa(m, MSG_SQL.backupDoImportInexistente)) {
    return 'O backup deste import não foi encontrado no armazenamento. NADA foi apagado — refaça o preview para gerar o backup de novo.'
  }
  if (casa(m, MSG_SQL.backupDeOutraFilial)) {
    return 'O backup informado não é o backup desta filial. NADA foi apagado — refaça o preview para gerar o backup certo.'
  }
  if (casa(m, MSG_SQL.confirmacaoDoImport)) {
    return 'A confirmação não confere. Digite exatamente o nome da filial mostrado ao lado do campo — sem abreviar.'
  }
  if (casa(m, MSG_SQL.importRepetido)) {
    return 'Este mesmo arquivo já foi importado nesta filial nas últimas 24 horas. NADA foi apagado — se a reimportação é mesmo intencional, corrija o arquivo ou aguarde a janela de 24 horas.'
  }
  if (casa(m, MSG_SQL.semEscritaNoImport)) {
    return 'Você não tem permissão de escrita nesta filial — o import foi recusado. NADA foi apagado.'
  }
  if (casa(m, MSG_SQL.foraDaOrganizacao)) {
    return 'Este usuário não pertence à sua organização — a ação foi recusada.'
  }

  if (casa(m, MSG_SQL.saldoAlvoInvalido)) {
    return 'O saldo alvo precisa ser zero ou maior.'
  }

  // ---- F24: as recusas da MESA DE CONFLITOS entre filiais (migration 0093) ----
  // Mesma armadilha dos ramos da F23 logo acima: a RPC recusa com 42501, mas o motivo não é
  // o cargo de quem chamou. Sem estes ramos, um administrador leria "seu cargo ou suas
  // filiais de escrita não permitem" — falso, e mandaria investigar a coisa errada.
  if (casa(m, MSG_SQL.foraDeConflito)) {
    return 'Esta ferramenta só apaga cadastro que esteja em conflito entre filiais. Algum dos selecionados não está (mais) — nada foi apagado. Recarregue a mesa de conflitos e refaça a seleção.'
  }
  // (a recusa de CARGO da mesa — "Apenas administradores podem resolver conflitos entre
  //  filiais" — NÃO tem ramo próprio de propósito: ela contém "apenas administradores" e é
  //  capturada pelo ramo da F21 mais abaixo, que já responde "Esta ação é restrita a
  //  administradores." Um ramo aqui seria código morto — a revisão adversarial pegou.)
  //
  // O ativo sumiu entre a leitura da mesa e o clique — típico de duas pessoas resolvendo o
  // mesmo conflito. Sem este ramo, o P0002 cairia no fallback genérico.
  if (casa(m, MSG_SQL.ativosNaoEncontrados)) {
    return 'Um dos cadastros selecionados já não existe — alguém resolveu este conflito enquanto a sua página estava aberta. Nada foi apagado: recarregue a mesa.'
  }
  // ⚠ CORRIGIDO NA F52. Este comentário dizia que o ramo abaixo "vem ANTES do ramo de
  // backup do RESET (F23)". Não vem — o do reset está mais ACIMA neste mesmo arquivo, e
  // sempre esteve. A afirmação descrevia uma proteção que não existe.
  //
  // O que de fato protege os dois ramos é que as strings são DISJUNTAS: o do reset casa
  // "backup informado não existe" e este casa "backup dos conflitos não existe" — nenhuma
  // é substring da outra, então a ORDEM FÍSICA é irrelevante. Era a segunda metade do
  // comentário original ("por isso a mensagem da RPC da mesa diz backup dos conflitos")
  // que estava certa, e ela é a regra de verdade: mensagem nova de backup NASCE disjunta.
  // É a régua que a F52 seguiu ao escrever "o backup deste import não foi encontrado".
  if (casa(m, MSG_SQL.backupDosConflitosInexistente)) {
    return 'O backup desta exclusão não foi encontrado no armazenamento. NADA foi apagado — refaça a seleção e tente de novo.'
  }
  if (casa(m, MSG_SQL.termoForaDaSelecao)) {
    return 'Um dos selecionados está num termo que também cobre cadastros fora desta seleção: apagá-lo destruiria um documento que não é só dele. Inclua na seleção os outros cadastros do mesmo termo, ou apague o termo antes.'
  }
  if (casa(m, MSG_SQL.exigeBackupEmArquivo)) {
    return 'Seleção grande demais para o backup automático. Nada foi apagado — apague em levas menores.'
  }
  if (casa(m, MSG_SQL.backupDeOutraOperacao)) {
    return 'O backup informado não é o backup desta operação. Nada foi apagado — refaça a seleção.'
  }
  if (casa(m, MSG_SQL.selecaoGrandeDemais)) {
    return 'Seleção grande demais para uma operação só. Apague em levas menores.'
  }
  if (casa(m, MSG_SQL.nenhumAtivoSelecionado)) {
    return 'Nenhum cadastro selecionado para apagar.'
  }
  // §5.1 — mover o ativo para a filial onde o gêmeo já está (transferência, ou estorno de
  // uma transferência antiga). A recusa vem da guarda da migration 0097, e não do 23505
  // cru: sem este ramo ela cairia no genérico de 42501 e diria "seu cargo não permite",
  // que é falso. Texto próprio, e não o do banco — a regra da casa é que mensagem crua do
  // Postgres não vai para a tela (a da RPC nomeia a filial, mas cita "patrimônio +
  // service tag" em vocabulário de banco).
  if (casa(m, MSG_SQL.identidadeNaFilialDeDestino)) {
    return 'A filial de destino já tem um cadastro deste mesmo equipamento (mesmo patrimônio e mesma service tag). Resolva o conflito entre filiais na aba "Conflitos entre filiais" de Pendências antes de mover o ativo.'
  }

  // ---- F56: o gatilho `vocabulario_unidades_guarda` (migration 0139, Decisão 2) ----
  // A diagonal nome×apelido — cadastrar um apelido igual ao nome de outra filial,
  // renomear uma filial para um termo que já é apelido de alguém, ou tentar
  // apelidar uma filial com o próprio nome dela. A mensagem do gatilho JÁ é em
  // pt-BR e já nomeia o termo e a filial dona (é escrita para o operador, não
  // para o log) — mesmo assim não a repassamos verbatim (regra do fallback
  // logado, abaixo, e o precedente dos blocos F21-F24 acima: nenhum deles extrai
  // valor dinâmico de dentro da mensagem do banco). A pré-checagem em
  // `dono-do-termo.ts` é quem dá a mensagem PRECISA, ANTES de chegar aqui; este
  // ramo só existe para a corrida rara (dois admins ao mesmo tempo) que passa
  // pela pré-checagem verde.
  if (casa(m, MSG_SQL.vocabularioDeUnidades)) {
    return 'Este nome ou apelido já está em uso (por outra filial, ou por esta mesma do outro lado). Atualize a página para ver qual, e tente de novo.'
  }

  // 42501 = insufficient_privilege: cobre tanto "new row violates row-level security
  // policy" (WITH CHECK reprovado) quanto "permission denied for table/column" (o grant de
  // coluna de `profiles`, migration 0063).
  if (c === '42501' || casa(m, FRASES_DO_MOTOR.semPermissao)) {
    return 'Sem permissão para esta operação: seu cargo ou suas filiais de escrita não permitem. Se seu acesso mudou agora, recarregue a página; se não, fale com um administrador.'
  }

  // ---- raises P0001 da RPC do import (importar_ativos_substituir) ----
  // São mensagens NOSSAS, já em pt-BR e voltadas ao operador. Mapeamos as que
  // reconhecemos por substring para um texto limpo e estável (sem os valores
  // interpolados que a RPC injeta); o que não reconhecermos cai no fallback
  // LOGADO abaixo (regra CLAUDE.md: nunca vazar texto cru desconhecido).
  if (casa(m, MSG_SQL.estadoDaFilialMudou)) {
    return 'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.'
  }
  if (casa(m, MSG_SQL.planoVazio)) {
    return 'O plano de import está vazio. Gere o preview novamente.'
  }
  if (casa(m, MSG_SQL.termoMisturaFiliais)) {
    return 'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.'
  }
  if (casa(m, MSG_SQL.patrimonioInvalidoNoPlano)) {
    return 'Há um patrimônio fora do padrão no plano. Gere o preview novamente.'
  }
  if (casa(m, MSG_SQL.valorInvalidoNoPlano)) {
    return 'Há um valor inválido no plano (categoria ou estado do ativo). Gere o preview novamente.'
  }
  if (casa(m, MSG_SQL.duplicadoOuRepetida) && casa(m, MSG_SQL.serviceTag)) {
    return 'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.'
  }
  // Conferências internas da RPC (contagem/estado/colaborador/agregada): a
  // transação já reverteu (tudo-ou-nada), nada foi alterado. Não expõe o detalhe
  // interno — orienta a refazer e avisar o TI se persistir.
  if (casa(m, MSG_SQL.divergencia)) {
    return 'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.'
  }

  // Fallback: SEMPRE registra o par { code, mensagem } no servidor — assim o
  // próximo erro deixa de ser cego (F7F). Em dev devolve a mensagem crua (debug);
  // em produção NUNCA vaza o texto interno do Postgres para a operadora.
  // O par `{ code, mensagem }` vai nos campos NATIVOS do funil (`erro.codigo` e
  // `erro.mensagem`), não num `ctx` paralelo: é exatamente o formato que o funil
  // existe para padronizar, e é o mesmo par que o `descreverErro` do smoke usa.
  registrarFalha({
    escopo: 'erros.nao-mapeado',
    erro: { code: code ?? null, message: mensagem ?? null },
  })
  if (process.env.NODE_ENV !== 'production') {
    return mensagem ?? 'Não foi possível concluir a operação.'
  }
  return 'Não foi possível concluir a operação. Tente novamente.'
}
