import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const administracao: PaginaAjuda = {
  slug: 'administracao',
  titulo: 'Administração: os cadastros de apoio',
  resumo: 'Filiais, colaboradores, motivos, catálogo de itens, tipos e kits.',
  categoria: 'fazer',
  termos: [
    'admin',
    'cadastro',
    'filial',
    'colaborador',
    'pessoa',
    'tipo de item',
    'motivo',
    'catalogo',
    'vocabulario',
    'desativar',
    'slug',
    'excluir',
    'apagar',
    'cargo',
    'administrador',
    'desenvolvedor',
  ],
  legado: ['admin'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `A área de Administração concentra os cadastros de apoio. Ela é dos cargos ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.dev} — o segundo faz aqui tudo o que o primeiro faz, e mais um pouco na tela de usuários. Quem tem outro cargo não vê o item "Administração" no menu, e abrir o endereço na mão não contorna: a tela devolve ao início e nada aqui aceita mudança de quem não alcança a área.`,
    },
    {
      tipo: 'paragrafo',
      texto:
        'Todas as abas dividem o mesmo título "Administração" e a mesma barra: "Usuários", "Senhas de acesso", "Filiais", "Colaboradores", "Motivos", "Kits", "Itens", "Tipos de item" e "Importar". Mexa aqui quando faltar uma opção nas telas de operação (uma filial nova, um motivo que não existe, um item fora do catálogo) — não para consertar um registro já feito, que se corrige na ficha ou por estorno.',
    },
    {
      tipo: 'lista',
      itens: [
        `Usuários — as contas do sistema: convidar, definir o cargo e as filiais de escrita, desativar e reativar, e a trilha das ações administrativas. Só e-mails ${DOMINIOS_TEXTO} podem ser convidados. Trocar o e-mail de uma conta, apagar uma conta e encerrar as sessões de alguém são ações do cargo ${PAPEL_ROTULO.dev}, e só aparecem para ele.`,
        'Senhas de acesso — senhas que dão ao visualizador acesso só aos relatórios. Revogar pede confirmação e tem efeito imediato, no carregamento de tela seguinte; a senha revogada pode ser reativada na mesma lista.',
        'Filiais — cadastro das filiais.',
        'Colaboradores — as pessoas a quem os equipamentos são entregues, e a fila dos nomes que já foram digitados à mão e ainda não viraram cadastro.',
        'Motivos — o vocabulário de motivos oferecido na tela de movimentação.',
        'Kits — os modelos do passo 2 da movimentação (tipo, motivo, termo, observação padrão e as categorias esperadas), aplicados com um clique em Nova movimentação.',
        'Itens — o catálogo de itens por quantidade (nome, grupo, ordem, estoque mínimo). O tipo de cada item também se escolhe aqui, na coluna "Tipo".',
        'Tipos de item — o vocabulário do que acompanha um equipamento (carregador, mochila, fone de ouvido). É o que a conferência da devolução lista.',
        'Importar — import de startup de uma filial por arquivo (CSV ou Excel .xlsx), para o go-live dela no sistema.',
      ],
    },
    {
      tipo: 'nota',
      texto: `Nada aqui se apaga por hábito: filial, motivo, kit, item e USUÁRIO se DESATIVAM. Desativar tira a opção das telas de operação (ou o acesso da pessoa) sem tocar em nada do que já foi registrado com ela — o histórico continua legível e a autoria continua com nome. Apagar de verdade existe em dois casos, e só: item que nunca teve lançamento, e conta de usuário — esta última pelas mãos do cargo ${PAPEL_ROTULO.dev}, e mesmo ela deixa o histórico da pessoa intacto.`,
    },

    { tipo: 'titulo', id: 'admin-filiais', texto: 'Filiais' },
    {
      tipo: 'passos',
      titulo: 'Cadastrar ou editar uma filial',
      itens: [
        'Em Administração › Filiais, a tabela mostra "Nome", "Slug", "Ativos", "Status" e "Ações". Use "Nova filial" ou "Editar" na linha.',
        'Preencha o "Nome" — o "Slug" é sugerido a partir dele. O slug entra no endereço do relatório daquela filial, então evite mudá-lo depois de divulgar links. Duas palavras não são aceitas como slug porque o sistema já as usa: "geral" e "todas".',
        'Preencha a "Cidade": é ela que sai na última linha dos termos desta filial, antes das assinaturas (por exemplo: Linhares, 4 de agosto de 2026). Deixando em branco, o termo avisa na hora de gerar e quem estiver gerando pode escrever a cidade ali mesmo. A cláusula de foro do termo não muda — ela é da sede da empresa.',
        'Na edição existe a caixa "Filial ativa". Desmarcá-la tira a filial das listas e dos seletores; quando ainda há ativos ali, a própria tela avisa a quantidade ao lado da caixa.',
        'Confirme em "Salvar". Slug repetido é recusado com "Já existe uma filial com esse slug."',
        'Filial com acervo não é desativada: a mensagem diz quantos ativos existem e pede que sejam transferidos antes. O mesmo vale para saldo de item — a mensagem diz quantos itens e quantas unidades, e manda zerar o estoque em Itens por quantidade.',
        'Filial desativada não some do passado: o saldo que ficou nela continua contando no Total da página de Itens, com a nota "inclui N de filial desativada".',
      ],
    },
    {
      tipo: 'paragrafo',
      texto:
        'Na edição de uma filial, a seção "Na coluna Site do import" mostra o vocabulário que o import de startup reconhece para ela: o NOME PRÓPRIO (sempre vale, não precisa cadastrar) e os apelidos cadastrados — outras grafias que a coluna Site de um arquivo pode trazer. Filial sem nenhum apelido só reconhece a grafia exata do nome próprio.',
    },
    {
      tipo: 'passos',
      titulo: 'Cadastrar ou remover um apelido de unidade',
      itens: [
        'Abra "Editar" na filial — apelido só existe dentro da edição (uma filial em criação ainda não tem onde guardá-lo).',
        'Digite o termo em "Novo apelido" (como o arquivo escreve o Site) e use "Incluir".',
        'Cada apelido cadastrado aparece com um X ao lado para remover.',
        'Um termo que já é nome ou apelido de OUTRA filial é recusado, com a mensagem nomeando de qual filial.',
        'Sem nenhum apelido cadastrado, um aviso lembra que só a grafia exata do nome próprio é reconhecida.',
      ],
    },

    { tipo: 'titulo', id: 'admin-colaboradores', texto: 'Colaboradores' },
    {
      tipo: 'paragrafo',
      texto:
        'Até agora o nome de quem recebia o equipamento era digitado a cada movimentação. "João Silva", "Joao Silva" e "joão  silva" viravam três pessoas diferentes na hora de somar o que cada um está usando. Esta aba dá um cadastro para cada pessoa — e o campo da movimentação passa a oferecer a lista, sem deixar de aceitar um nome novo digitado na hora.',
    },
    {
      tipo: 'passos',
      titulo: 'Cadastrar uma pessoa',
      itens: [
        'Em Administração › Colaboradores, a tabela mostra "Nome", "Setor", "Matrícula", "Filial", "Registros", "Status" e "Ações". Use "Novo colaborador" ou "Editar". Acima há a busca por nome, matrícula ou setor e o filtro por filial — inclusive "Sem filial", que é como nasce quem foi cadastrado no meio de um lote de filiais misturadas.',
        'Só o "Nome" é obrigatório. Matrícula, setor e filial são referência e podem ficar em branco; a filial aqui NÃO limita quem pode registrar movimentação para essa pessoa.',
        'A coluna "Registros" conta as movimentações e os lançamentos de item já ligados a este cadastro. Ela começa em zero mesmo para quem aparece no histórico há meses: o que já foi registrado guarda o nome como estava no dia, e continua assim.',
        'Nome repetido é recusado: "Já existe um colaborador com este nome." Duas pessoas com o mesmo nome não cabem no cadastro — a saída é escrever o nome completo de uma delas, ou registrar a matrícula para distinguir.',
        'Ninguém é apagado daqui. Quem sai da empresa é desmarcado em "Colaborador ativo": some das sugestões e continua no histórico, com nome.',
        'A pessoa também pode ser cadastrada sem passar por aqui, no botão "Cadastrar" que aparece embaixo do campo Colaborador da movimentação e do lançamento de item.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Transformar em cadastro os nomes que já foram digitados',
      itens: [
        'Abaixo da lista fica a seção "Nomes digitados que ainda não têm cadastro". Cada linha junta as grafias de um mesmo nome e mostra em quantos registros ele aparece; a coluna "Grafias" acusa quando o mesmo nome foi escrito de mais de um jeito.',
        'Os três cartões dizem quantos nomes ainda não têm cadastro, quantos já têm, e quantos você marcou. Os números são do total, não do que coube na tela: quando a lista é maior que o que cabe, aparece um aviso dizendo o total e sugerindo cadastrar em levas.',
        'Marque as linhas (ou a caixa do cabeçalho, que marca todas as visíveis) e clique em "Cadastrar N selecionado(s)". São no máximo 200 por vez. O nome criado é a grafia mais usada do grupo.',
        'Cadastrar aqui NÃO altera nenhuma movimentação já registrada — o histórico fica exatamente como está. O que muda é dali para a frente: os registros novos passam a sair ligados ao cadastro.',
        'Um nome cadastrado sai da fila no carregamento seguinte da tela.',
      ],
    },

    { tipo: 'titulo', id: 'admin-motivos', texto: 'Motivos' },
    {
      tipo: 'passos',
      titulo: 'Criar ou editar um motivo',
      itens: [
        'Em Administração › Motivos, a tabela mostra "Rótulo", "Código", "Aplica-se a", "Status" e "Ações". Use "Novo motivo" ou "Editar".',
        'O "Rótulo" é o que o operador lê no seletor da movimentação. O "Código" é a identidade do motivo e é FIXO depois de criado — na edição o campo aparece desabilitado.',
        'Em "Aplica-se a", marque os tipos de movimentação que devem oferecer aquele motivo. Motivo sem tipo marcado não aparece em lugar nenhum.',
        'Na edição, a caixa "Motivo ativo" tira o motivo do seletor sem apagar o que já foi registrado com ele.',
        'Código repetido é recusado com "Já existe um motivo com esse código."',
        'Se um motivo desativado estiver salvo dentro de um kit, aplicar o kit preenche o resto e avisa que o motivo precisa ser escolhido de novo.',
      ],
    },

    { tipo: 'titulo', id: 'admin-itens', texto: 'Catálogo de itens' },
    {
      tipo: 'passos',
      titulo: 'Cadastrar um item no catálogo',
      itens: [
        'Em Administração › Itens, a tabela mostra "Nome", "Grupo", "Ordem", "Mínimo", "Lançamentos", "Status" e "Ações". Use "Novo item" ou "Editar". Acima da tabela há um campo de busca por nome ou grupo, com a contagem "N de M" ao lado — o catálogo cresce e rolar a lista inteira para achar um cabo deixou de ser o caminho.',
        'Preencha o "Nome" (é ele que aparece na busca do lançamento), escolha o "Grupo" e, se quiser, ajuste a "Ordem" — ela controla a posição do item dentro do bloco do grupo, na página de saldos.',
        'O campo "Estoque mínimo" é o ponto de reposição: 0 significa sem alerta, e acima de 0 o item ganha o aviso "repor" quando o estoque ficar abaixo do número. O mínimo é UM SÓ por item (não existe mínimo por filial); o que muda é com qual estoque ele é comparado — sem filtro, o de todas as filiais; com uma filial filtrada na página Itens, o daquela filial. Na coluna "Mínimo", 0 aparece como travessão.',
        'Item que já tem lançamento NÃO se exclui — a tela diz quantos existem e o caminho é desmarcar "Item ativo". Só item sem nenhum lançamento mostra o botão "Excluir".',
        'Nome repetido é recusado com "Já existe um item com esse nome." Se o homônimo estiver desativado, o caminho é reativá-lo em vez de criar outro.',
        'Item também pode ser criado sem passar por aqui, direto no diálogo de lançamento — é o mesmo catálogo, e por isso também é da Administração.',
      ],
    },

    { tipo: 'titulo', id: 'admin-tipos-item', texto: 'Tipos de item' },
    {
      tipo: 'passos',
      titulo: 'Manter o vocabulário dos tipos',
      itens: [
        'Em Administração › Tipos de item, a tabela mostra "Nome", "Código", "Ordem", "Itens", "Status" e "Ações". Use "Novo tipo" ou "Editar".',
        'O "Nome" é o que aparece nas telas — foi por aqui que "Fone" passou a se chamar "Fone de ouvido". O "Código" é a identidade do tipo, é sugerido a partir do nome e é FIXO depois de criado: é ele que fica gravado nas devoluções já registradas, e mudá-lo tornaria ilegível o que já foi escrito.',
        'A "Ordem" controla a posição na lista. Deixando em branco, o tipo novo entra no fim.',
        'A coluna "Itens" conta quantos itens do catálogo apontam para o tipo. Tipo não se exclui: desmarque "Tipo ativo" para tirá-lo das listas sem tocar no que já foi registrado.',
        'Código repetido é recusado. Se o homônimo estiver desativado, criar de novo o reativa em vez de recusar.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'O tipo de cada item do catálogo é escolhido na própria lista de Administração › Itens, na coluna "Tipo" — não é preciso abrir o item. Escolher é opcional e pode ser feito aos poucos: um aviso acima da tabela diz quantos itens ainda estão sem tipo, e some sozinho quando não houver mais nenhum.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'usuarios-e-senhas' },
        { slug: 'kits-de-movimentacao' },
        { slug: 'import-de-startup' },
        { slug: 'saldos-e-estoque-minimo', ancora: 'minimo' },
        { slug: 'lancar-itens' },
      ],
    },
  ],
}
