import { STATUS_META, TIPO_META } from '@/lib/dominio'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: acessorios do checklist, rotulos de tipo e de status sao todos
// DERIVADOS de dominio.ts — acessorio novo aparece aqui sozinho.
const T = TIPO_META
const S = STATUS_META

export const devolucaoETriagem: PaginaAjuda = {
  slug: 'devolucao-e-triagem',
  titulo: 'Receber de volta: devolução e triagem',
  resumo: 'O checklist de acessórios e a conferência antes de voltar ao estoque.',
  categoria: 'fazer',
  termos: [
    'devolucao',
    'triagem',
    'checklist',
    'acessorio',
    'faltante',
    'carregador',
    'desligamento',
    'devolver',
    'troca',
    'upgrade',
    'contrapartida',
    'trocar notebook',
  ],
  legado: ['movimentacoes'],
  blocos: [
    {
      // F34 — a triagem deixou de ser passo obrigatório da devolução: antes,
      // "receber de volta" eram SEMPRE duas movimentações (a devolução jogava
      // em_triagem e só a triagem OK liberava o estoque de novo). Hoje a
      // devolução sozinha já devolve o equipamento ao estoque; conferir antes
      // virou uma escolha do operador, não um passo obrigatório do fluxo.
      tipo: 'paragrafo',
      texto: `"${T.devolucao.rotulo}" encerra a posse do colaborador e devolve o equipamento à TI — ele já conta como "${S.em_estoque.rotulo}" (disponível) na hora, sem passo extra. Quer conferir antes de liberar de novo (acessórios, backup, decisão de destino)? Registre "${T.envio_triagem.rotulo}" — é opcional, e quem decide é você. Estando "${S.em_triagem.rotulo}", "${T.triagem_ok.rotulo}" devolve o equipamento ao estoque de novo.`,
    },
    {
      tipo: 'nota',
      texto:
        'Saída e Empréstimo exigem o Colaborador OU o Setor de destino (ao menos um). Na Devolução, marque no checklist os acessórios que NÃO voltaram — cada item marcado abre uma pendência de itens faltantes própria, presa àquela devolução e ao colaborador que devia devolver (não ao próximo dono do ativo). Ela se encerra na página Pendências, com desfecho manual; a Triagem OK NÃO apaga mais essas pendências.',
    },
    {
      tipo: 'lista',
      itens: [
        'Checklist de devolução: a lista de itens conferidos vem do catálogo de tipos de item — o administrador acrescenta ou desativa o que quiser em Administração › Tipos de item, e a devolução passa a oferecer isso.',
        'O Motivo (quando aparece) vem do catálogo de motivos, mantido em Administração › Motivos.',
      ],
    },
    { tipo: 'titulo', id: 'devolucao-receber', texto: 'Registrar a devolução' },
    {
      tipo: 'passos',
      titulo: 'Receber um equipamento de volta (devolução)',
      itens: [
        `Antes de começar: o ativo precisa estar "${S.em_uso.rotulo}" ou "${S.emprestado.rotulo}" — são os dois únicos estados de onde a devolução sai.`,
        'Abra "Nova movimentação" e adicione os equipamentos. Desligamento com quatro equipamentos? Um lote só resolve, e o termo de devolução sai consolidado no fim.',
        `Escolha "${T.devolucao.rotulo}" em "Tipo de movimentação".`,
        '"Motivo *" é obrigatório: é ele que diz por que o equipamento voltou (troca, desligamento, fim do empréstimo). O motivo também decide qual modelo de termo de devolução será oferecido depois.',
        'Confira com o equipamento na mão o bloco "O que voltou com o equipamento". Cada acessório tem dois botões: "Voltou" repõe o acessório no estoque da filial na hora e baixa da conta da pessoa; "Faltou" abre a pendência, como sempre. Deixe em branco o que não fazia parte da entrega — o bloco é opcional.',
        'Ao lado do checklist aparece "Com esta pessoa": o que o sistema tem registrado com quem está devolvendo. Nome que ainda não está no cadastro, ou item que nunca foi registrado com ela, não impede nada — marcar "Voltou" repõe o estoque do mesmo jeito, só não baixa conta de ninguém.',
        'Um acessório que existe no vocabulário mas não tem item correspondente no catálogo também não bloqueia: a devolução é registrada e a linha diz que o estoque não mudou.',
        `Marcar um item aqui NÃO segura o equipamento fora do estoque: ele volta a "${S.em_estoque.rotulo}" nesta MESMA devolução, com a pendência aberta em paralelo. Quer conferir e resolver o que falta antes de liberar de novo? Registre "${T.envio_triagem.rotulo}" logo em seguida (ver "Enviar para triagem", abaixo).`,
        'Ajuste a "Data" (a data em que o equipamento chegou à TI) e registre.',
        'Na tela de sucesso, o botão "Gerar termo de devolução ({n})" emite UM termo para o lote inteiro, listando todos os equipamentos devolvidos.',
      ],
    },
    { tipo: 'titulo', id: 'devolucao-faltantes', texto: 'Quando falta um acessório' },
    {
      tipo: 'lista',
      itens: [
        'Cada acessório marcado vira uma linha própria na página Pendências, na aba "Itens faltantes", com o colaborador daquela devolução e a data.',
        'A pendência é do EVENTO, não do equipamento: se o notebook sair para outra pessoa amanhã, a pendência continua apontando quem ficou devendo o carregador.',
        'Na ficha do ativo elas aparecem no card "Itens faltantes da devolução", com as abertas em destaque e as resolvidas logo abaixo, como registro (desfecho, quem resolveu e quando).',
        'O desfecho é escolhido na página Pendências: "Item recuperado" ou "Baixa — não vai voltar". Dá para resolver várias de uma vez, com uma justificativa só.',
        'Resolver agora MEXE NO ESTOQUE, e é o que fecha a conta: "Item recuperado" devolve o acessório à prateleira e tira da conta da pessoa; "Baixa" tira da conta dela e também do total da TI — o acessório deixou de existir. Antes, item dado como perdido ficava na conta da pessoa para sempre.',
        'Reabrir uma pendência resolvida (nível administrador) desfaz esses lançamentos junto. Não sendo possível desfazer, a reabertura é recusada — nunca fica lançamento solto.',
        'Aprovar a triagem não encerra essas pendências — os dois assuntos são independentes de propósito.',
      ],
    },
    {
      // F34 — o par que a página tratava em seções separadas: a pendência de
      // item (acima) não segura o equipamento, e a triagem (abaixo) segura.
      // Sem esta ponte, o operador que só leu o checklist de acessórios
      // conclui — errado — que marcar um item faltante já tira o equipamento
      // do estoque disponível.
      tipo: 'nota',
      texto: `Marcar item faltante NÃO segura o equipamento: mesmo com a pendência aberta, ele já conta como "${S.em_estoque.rotulo}" e pode ser entregue a outra pessoa antes de o acessório aparecer — quem recebe pode ficar sem o carregador. Quer impedir isso? Registre "${T.envio_triagem.rotulo}" logo depois da devolução: enquanto o ativo estiver "${S.em_triagem.rotulo}" ele some do estoque disponível e do card "Disponíveis por modelo", só voltando por "${T.triagem_ok.rotulo}". É esse o caso de uso do tipo novo — usar os dois juntos quando o equipamento não pode sair de novo sem antes resolver o que falta.`,
    },
    {
      tipo: 'titulo',
      id: 'devolucao-troca-upgrade',
      texto: 'Devolução que é troca: registre a entrega junto',
    },
    {
      tipo: 'lista',
      itens: [
        `Quando o motivo da devolução é "Troca / upgrade" (é o rótulo padrão; Administração › Motivos pode renomeá-lo), a mesma tela abre a seção "${T.saida.rotulo} da troca" para o equipamento que entra no lugar — e as duas metades entram num "Registrar" só.`,
        `A seção aparece nos dois sentidos: começando pela "${T.saida.rotulo}" com esse mesmo motivo, quem abre é a seção "${T.devolucao.rotulo} da troca", e a busca dela acha o equipamento antigo pelo nome do colaborador.`,
        `Cada metade obedece às regras de sempre: o que entra precisa estar "${S.em_estoque.rotulo}", "${S.reservado.rotulo}" ou "${S.em_triagem.rotulo}"; o que volta, "${S.em_uso.rotulo}" ou "${S.emprestado.rotulo}".`,
        `O checklist de acessórios é sempre da metade que RECEBE de volta — na seção da troca ele aparece como "Itens faltantes na devolução da troca", e cada item marcado abre a mesma pendência de sempre.`,
        'A tela de sucesso traz o documento de cada metade: o termo de responsabilidade dos equipamentos entregues e o termo de devolução dos que voltaram.',
        'Marcando "Deixar a contrapartida para depois", só a metade montada é registrada, e a tela de sucesso oferece o atalho para lançar a outra em seguida — atalho que não reaparece na tela que ele mesmo abriu.',
        'As duas movimentações são independentes depois de gravadas: estornar uma delas não desfaz a outra.',
      ],
    },
    {
      tipo: 'titulo',
      id: 'devolucao-envio-triagem',
      texto: 'Enviar para triagem (quando quiser conferir)',
    },
    {
      tipo: 'passos',
      titulo: 'Separar um equipamento para conferência manual',
      itens: [
        `A devolução já deixa o equipamento "${S.em_estoque.rotulo}" — conferir antes NÃO é uma etapa do fluxo, é uma escolha sua. Quer olhar o equipamento antes de liberar de novo? Registre "${T.envio_triagem.rotulo}".`,
        `Antes de começar: o ativo precisa estar "${S.em_estoque.rotulo}" — é o único estado de onde a triagem manual sai.`,
        `Escolha "${T.envio_triagem.rotulo}" em "Tipo de movimentação"; só a "Data" é obrigatória.`,
        'Use quando fizer sentido conferir: checklist de acessórios, backup e limpeza dos dados, ou decidir o destino do equipamento (segue apto para liberar, precisa de manutenção, está defasado).',
        `Enquanto o ativo estiver "${S.em_triagem.rotulo}", ele NÃO conta como disponível — some do estoque e do card "Disponíveis por modelo" até voltar por "${T.triagem_ok.rotulo}", logo abaixo.`,
        `A pendência "triagem parada" (equipamento parado há mais de 7 dias) passa a acusar só quem foi mandado para lá de propósito — não mais toda devolução, que agora nem passa por aqui.`,
      ],
    },
    { tipo: 'titulo', id: 'devolucao-triagem', texto: 'Conferir e liberar (Triagem OK)' },
    {
      tipo: 'passos',
      titulo: 'Aprovar a triagem e devolver o equipamento ao estoque',
      itens: [
        `Com o equipamento "${S.em_triagem.rotulo}", faça a conferência de sempre: liga, tem senha, precisa de formatação, chegou com defeito.`,
        `Estando apto, registre "${T.triagem_ok.rotulo}" — só a "Data" é obrigatória; o "Motivo" é opcional. O ativo volta a "${S.em_estoque.rotulo}" e passa a contar como disponível.`,
        `Chegou com defeito? Não passe pela triagem: de "${S.em_triagem.rotulo}" saem direto "${T.envio_manutencao.rotulo}", "${T.marcar_defasado.rotulo}" e "${T.descarte.rotulo}".`,
        `Precisa entregar na hora para outra pessoa? De "${S.em_triagem.rotulo}" também sai a "${T.saida.rotulo}" direto, sem passar pelo estoque.`,
        `Equipamento parado "${S.em_triagem.rotulo}" há mais de 7 dias vira a pendência "triagem parada" e aparece na página Pendências, na aba "Triagem" — é o lembrete de que alguém precisa conferir aquilo.`,
      ],
    },
    { tipo: 'titulo', id: 'devolucao-bastidores', texto: 'O que acontece por trás' },
    {
      tipo: 'lista',
      itens: [
        'A devolução limpa o Colaborador e o Setor da ficha: o equipamento passa a ser da TI de novo.',
        'A linha entra na tabela "Entradas" do relatório do período, com as colunas "Motivo", "Colaborador", "Setor" e "Itens faltantes".',
        'A pendência de termo da entrega anterior deixa de valer, porque ela só existe enquanto o ativo está entregue.',
        'A devolução já entra na contagem de "Em estoque" e no card "Disponíveis por modelo" do relatório — não é preciso passar pela triagem para o equipamento virar estoque disponível.',
        'A triagem aprovada devolve o equipamento à contagem de "Em estoque" e ao card "Disponíveis por modelo" do relatório do mesmo jeito, para quem passou por ela.',
        'Acessórios e periféricos que voltaram (mouse, fone, carregador avulso) não entram por aqui: eles são controlados por quantidade, na tela Itens.',
      ],
    },
    { tipo: 'titulo', id: 'devolucao-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          `O tipo "${T.devolucao.rotulo}" não aparece na lista`,
          `Algum ativo do lote não está "${S.em_uso.rotulo}" nem "${S.emprestado.rotulo}". O aviso "Os ativos estão em estados diferentes" confirma; separe o lote.`,
        ],
        [
          '"Informe o motivo"',
          'A devolução exige motivo. Se o motivo certo não estiver na lista, cadastre-o em Administração › Motivos marcando a devolução em "Aplica-se a".',
        ],
        [
          'Marquei o acessório errado no checklist',
          'Se a devolução ainda for a última movimentação do ativo, estorne-a pela linha do tempo e registre de novo. A pendência aberta some junto com o estorno.',
        ],
        [
          'O acessório apareceu depois',
          'Não estorne: resolva a pendência na página Pendências com o desfecho "Item recuperado".',
        ],
        [
          // F34 — a devolução deixou de levar para a triagem sozinha; a linha
          // antiga ("A devolução sempre leva para a triagem — é o desenho do
          // fluxo") ficou FALSA e virou o erro contrário: o operador que
          // procura o passo automático de antes.
          `Quero conferir o equipamento antes de liberar de novo, e não acho o passo`,
          `A devolução não leva mais sozinha para a triagem. Registre "${T.envio_triagem.rotulo}" (o ativo precisa estar "${S.em_estoque.rotulo}") e, depois de conferir, "${T.triagem_ok.rotulo}" para liberar de novo.`,
        ],
        [
          '"{patrimônio} está nas duas metades da troca"',
          'O mesmo equipamento não pode voltar e sair no mesmo registro. Tire-o de uma das duas seções da troca.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'resolver-pendencias', texto: 'Resolver a pendência do acessório que não voltou' },
        { slug: 'registrar-movimentacao' },
        { slug: 'tipos-de-movimentacao' },
        { slug: 'termos-de-responsabilidade', texto: 'O termo de devolução' },
        { slug: 'entregar-emprestar-reservar', texto: 'Entregar o equipamento de novo' },
      ],
    },
  ],
}
