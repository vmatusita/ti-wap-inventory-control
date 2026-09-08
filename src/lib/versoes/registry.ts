// Registry de versoes do sistema (F35). UMA lista ordenada alimenta a pagina
// `/versoes`, o badge do rodape da sidebar, o `package.json` e os testes — nao
// existe segunda fonte.
//
// ORDEM: mais recente primeiro. `VERSOES[0]` E a versao atual, e um teste trava
// que ela seja identica a `package.json.version`.
//
// O ESQUEMA (ata `2026-08-12 · F35` em `docs/DECISOES.md`): cada FASE do
// `CHANGELOG.md` vira uma MENOR; cada entrega avulsa registrada la vira uma
// CORRECAO da menor vigente a epoca; as fases anteriores ao go-live sao `0.x.0`
// e o go-live de 15/07/2026 e a `1.0.0`. Entrada do CHANGELOG que agrupa varias
// fases vira uma versao por fase, todas com a data do cabecalho.
//
// AO ACRESCENTAR UMA VERSAO (regra permanente, item 7 do `CLAUDE.md`): escreva
// `mudancas` em LINGUAGEM DE OPERADOR — rotulos reais das telas, o efeito antes
// da causa, nada de vocabulario de desenvolvedor (ha um teste que recusa).
//
// Este modulo NAO e so-servidor (sao strings planas, sem import pesado), mas o
// badge da sidebar continua recebendo a versao por PROP do Server Component
// `(app)/layout.tsx` — importa-lo de um Client Component jogaria as dezenas de
// entradas para dentro do bundle sem necessidade.
import type { EntradaVersao } from '@/lib/versoes/tipos'

export const VERSOES: readonly EntradaVersao[] = [
  {
    versao: '1.57.0',
    data: '2026-09-08',
    fase: 'F52',
    titulo: 'Trancas novas em volta das contas, do import e da mesa de conflitos',
    mudancas: [
      'Nenhuma tela mudou de aparência, e nenhuma tarefa do dia a dia passou a ser recusada. O que entrou foram trancas — cada uma conferida nos dois sentidos: que ela recusa o que tem de recusar, e que ela deixa passar tudo o que já passava.',
      'O import de startup ficou bem mais difícil de usar por engano. Antes ele aceitava qualquer texto no lugar do arquivo de segurança; agora confere que o arquivo é mesmo o daquela filial e que ele existe de verdade antes de apagar qualquer coisa.',
      'A confirmação que você digita para liberar o import passou a valer também do lado do servidor. Antes ela era conferida só na tela, e ficou mais tolerante: pode digitar com espaço sobrando ou trocando maiúsculas e minúsculas, como já acontecia nas outras telas de operação perigosa.',
      'Importar duas vezes o mesmo arquivo na mesma filial dentro de 24 horas passou a ser recusado, com um aviso explicando o motivo. Antes o segundo import apagava tudo o que o primeiro tinha criado, sem avisar ninguém. Se a reimportação for mesmo necessária, basta corrigir o arquivo ou aguardar as 24 horas.',
      'A tela de histórico de imports passou a mostrar a identificação do arquivo usado em cada carga, que é justamente o que a nova recusa por arquivo repetido usa para decidir.',
      'Três avisos internos que descreviam o sistema de forma errada foram corrigidos — inclusive um que dizia que o conteúdo das planilhas nunca era guardado, quando as correções feitas na tela de conferência sempre foram guardadas.',
    ],
  },
  {
    versao: '1.56.0',
    data: '2026-09-08',
    fase: 'F51',
    titulo: 'O import de startup continua igual — mudou o que custa dar manutenção nele',
    mudancas: [
      'Nenhuma tela mudou. O import de startup faz exatamente o que fazia: substitui o acervo de uma filial, avisa o que apagou e registra tudo no histórico, com as mesmas mensagens de recusa nos mesmos momentos.',
      'O que mudou é por dentro. Aquela operação era uma peça única de quase 400 linhas, e qualquer ajuste nela — mesmo de três linhas — exigia reescrever a peça inteira. Foi assim que um defeito conhecido atravessou cinco revisões sem ser corrigido: quem mexia copiava o texto antigo e levava o defeito junto. Agora ela é montada com oito peças separadas e nomeadas, e mexer numa não obriga a tocar nas outras.',
      'A parte que apaga o acervo da filial ficou isolada numa peça só, e existe uma conferência automática que reprova qualquer alteração futura que espalhe esse poder para uma segunda peça. Antes isso era uma intenção escrita; agora é conferido a cada alteração.',
      'As oito peças novas não ficam disponíveis pela internet: só a operação de import as usa. Isso é conferido automaticamente a cada alteração, olhando a permissão de verdade no banco.',
      'Para ter certeza de que nada mudou de comportamento, a bateria de testes do import foi rodada antes e depois da mudança e comparada resposta por resposta — as onze conferências existentes deram resultado idêntico, palavra por palavra. Outras oito foram acrescentadas, uma para cada peça nova.',
    ],
  },
  {
    versao: '1.55.0',
    data: '2026-09-08',
    fase: 'F50',
    titulo: 'O relatório aberto e esquecido parou de se recarregar sozinho a noite inteira',
    mudancas: [
      'Uma aba de relatório deixada aberta em segundo plano parava de se atualizar sozinha a cada minuto. Quando você volta para ela, o relatório se atualiza uma vez e o horário ao lado do botão Atualizar acompanha. Quem está com a aba à vista não percebe diferença nenhuma.',
      'O botão Atualizar e a atualização automática deixaram de se atropelar: se as duas coincidirem, o relatório é buscado uma vez só, em vez de duas seguidas.',
      'O termo de responsabilidade continua sendo visto exatamente por quem já o via. A regra de quem pode abrir os arquivos de termo passou a ficar num lugar só, o que foi conferido arquivo por arquivo antes e depois: os 88 termos guardados seguem acessíveis a todo usuário ativo, e continuam fechados para quem foi desativado.',
      'Nenhuma outra tela mudou de aparência ou de comportamento.',
      'Foram criadas cinco conferências automáticas que rodam antes de qualquer alteração ir ao ar. Elas vigiam a tela de relatório aberta por senha: que dado sensível não passe a aparecer nela, e que nenhum link leve o convidado para fora do relatório — o que o desconectaria no meio da leitura.',
    ],
  },
  {
    versao: '1.54.0',
    data: '2026-09-07',
    fase: 'F49',
    titulo: 'Quem foi desativado parou de conseguir consultar o acervo por fora das telas',
    mudancas: [
      'Nenhuma tela mudou de aparência ou de comportamento. Quem usa o sistema normalmente não vai notar diferença nenhuma — as buscas, as sugestões de nome e de setor e o "Colar lista" continuam exatamente como estavam.',
      'O que mudou é o que acontece com uma conta DESATIVADA. Antes, desativar alguém tirava essa pessoa de todas as telas na hora, mas a busca de equipamentos e as sugestões de marca, modelo, fornecedor, pessoa e setor ainda respondiam a ela por um tempo, se alguém soubesse chamá-las direto, por fora do sistema. Nove consultas estavam nessa situação e agora conferem o acesso antes de responder.',
      'A restauração de um rascunho de movimentação passou a ter limite de 200 equipamentos por vez — o mesmo teto que o cadastro de compra já usa. Rascunho de verdade nunca chega perto disso; o limite fecha o caminho de pedir o acervo inteiro de uma vez.',
      'A conferência do custo foi feita antes de a mudança entrar: cada consulta protegida ficou cerca de 7 centésimos de segundo mais lenta, e só na primeira vez dentro de cada tela. Como as buscas já esperam você parar de digitar por 3 décimos de segundo antes de consultar, isso não é perceptível.',
      'Foram criadas três conferências automáticas que rodam antes de qualquer alteração ir ao ar: uma exige que toda consulta ao acervo confira o acesso (ou tenha o motivo escrito de por que não confere), outra impede que uma consulta ao banco seja levada por engano para dentro do navegador, e a terceira mantém a lista de todos os pontos do sistema que leem dados com poder de administrador, cada um com o motivo e a proteção anotados.',
    ],
  },
  {
    versao: '1.53.0',
    data: '2026-09-07',
    fase: 'F48',
    titulo: 'O sistema passou a manter uma lista de quem pode ver o quê',
    mudancas: [
      'Nenhuma tela mudou. Existem quatro caminhos por onde a informação sai do sistema — as regras que dizem quem enxerga cada tabela, as regras dos arquivos de termo guardados, as consultas que rodam com poder de administrador e o canal que atualiza a tela sozinha quando alguém registra uma movimentação. Até agora nenhum desses quatro tinha uma lista de conferência: dava para acrescentar um caminho novo e nada avisava.',
      'Agora os quatro são conferidos automaticamente antes de qualquer alteração ir ao ar, e a conferência é feita perguntando ao próprio banco de dados, não lendo uma lista escrita à mão que envelhece. Se aparecer uma tabela nova sem alguém ter decidido quem pode lê-la, ou uma regra que deixe todo mundo ver tudo, a alteração é barrada.',
      'As três tabelas que hoje ninguém enxerga de propósito — as senhas de acesso aos relatórios, o controle de tentativas de senha e um marcador interno — ficaram declaradas nominalmente, cada uma com o motivo escrito. Antes elas apenas não apareciam em lugar nenhum, o que é indistinguível de esquecimento.',
      'A conferência foi testada quebrando o sistema de propósito onze vezes: cada quebra precisou ser acusada pela conferência certa, e todas foram. Quatro verificações que pareciam funcionar mas passariam mesmo com o defeito presente foram corrigidas.',
    ],
  },
  {
    versao: '1.52.0',
    data: '2026-09-06',
    fase: 'F47',
    titulo: 'As conferências automáticas passaram a ser conferidas elas mesmas',
    mudancas: [
      'Nenhuma tela mudou. O sistema tem uma bateria de conferências que roda antes de qualquer alteração ir ao ar — ela testa se um operador consegue mexer em equipamento de filial que não é a dele, se alguém que foi desligado ainda enxerga o acervo, se as ferramentas que apagam registro exigem mesmo justificativa. Até agora ninguém tinha verificado se essas conferências sabem ACUSAR quando o defeito existe de verdade.',
      'Agora existe uma ferramenta que quebra o sistema de propósito, 28 vezes, e exige que a conferência certa acuse a quebra certa — não basta "deu erro em algum lugar". As 28 são defeitos reais, do tipo que já aconteceu: a permissão que confere o cargo e esquece a filial, a pessoa desativada que continua lendo, a exigência de justificativa que some. Todas as 28 foram acusadas.',
      'Cinco quebras ficaram de fora, e isso está declarado por escrito: são casos que a bateria de hoje não consegue enxergar, cada um com o nome da etapa futura que vai cobri-lo. Uma delas foi descoberta por essa própria ferramenta — uma conferência que dizia provar uma coisa e provava outra.',
      'Uma segunda ferramenta passou a comparar, a cada alteração, o desenho do banco de dados com a cópia que o sistema usa para se orientar. Antes ela podia envelhecer em silêncio, e já envelheceu: uma vez o sistema ficou meses trabalhando com uma cópia desatualizada sem ninguém perceber.',
    ],
  },
  {
    versao: '1.51.1',
    data: '2026-09-06',
    titulo: 'A conferência do banco de dados ficou quatro vezes mais rápida para todo mundo',
    mudancas: [
      'Nenhuma tela mudou. A versão anterior instalou uma conferência de banco de dados mais rápida e a deixou rodando lado a lado com a antiga, para comparar as duas. Elas deram exatamente o mesmo resultado cinco vezes seguidas, então a antiga foi desligada.',
      'O efeito prático: a bateria que confere o banco antes de qualquer alteração ir ao ar caiu de cerca de 3 minutos para menos de 1. Uma correção urgente termina de ser conferida bem mais cedo — e a conferência deixou de depender de um programa externo que já a derrubou duas vezes por motivos que nada tinham a ver com o sistema.',
    ],
  },
  {
    versao: '1.51.0',
    data: '2026-09-06',
    fase: 'F46',
    titulo: 'O histórico de alterações do banco de dados ficou protegido contra reescrita',
    mudancas: [
      'Nenhuma tela mudou. O que mudou é uma proteção nova sobre o histórico de alterações do banco de dados: cada arquivo de alteração já aplicada passou a ter uma assinatura registrada, e mexer num deles agora REPROVA a conferência automática, dizendo o nome do arquivo. Antes essa regra existia só escrita em três documentos, e nada no sistema a fazia valer — uma alteração antiga podia ser reescrita e tudo continuava verde.',
      'Isso importa porque as alterações do banco são aplicadas uma a uma, na ordem: reescrever uma que já foi aplicada deixa o projeto dizendo uma coisa e o banco fazendo outra, em silêncio. É o erro mais caro que existe nessa área, e agora ele é barrado antes de sair da mesa.',
      'A bateria de conferências do banco passou a rodar em cerca de um quarto do tempo — de 3 minutos e 52 segundos para 57 segundos. Na prática, uma correção urgente termina de ser conferida bem mais cedo e chega até você mais rápido.',
      'Essa mesma conferência deixou de depender de um programa externo que já a derrubou duas vezes por motivos que nada tinham a ver com o sistema (um limite de uso de um serviço de terceiro e uma falha de envio de estatísticas). Ela também passou a ser reproduzível na máquina do desenvolvedor, onde antes não rodava de jeito nenhum.',
    ],
  },
  {
    versao: '1.50.1',
    data: '2026-09-05',
    titulo: 'A conferência automática deixou de pular alteração que ficava na fila',
    mudancas: [
      'Nenhuma tela mudou. A correção é na bateria de conferências automáticas que a versão anterior instalou: quando duas alterações eram enviadas em sequência rápida, a que ficava esperando na fila era DESCARTADA sem ser conferida — e ia ao ar assim mesmo. Era metade do buraco que a versão anterior dizia ter fechado.',
      'Agora cada alteração tem a fila dela: nenhuma espera pela outra, e nenhuma é descartada. O defeito foi encontrado observando as conferências rodarem de verdade, não lendo o texto delas.',
    ],
  },
  {
    versao: '1.50.0',
    data: '2026-09-05',
    fase: 'F45',
    titulo: 'O sistema passou a barrar sozinho o que quebraria a operação',
    mudancas: [
      'Nenhuma tela mudou. O que mudou é o que acontece ANTES de uma alteração chegar até você: a bateria de conferências automáticas passou a poder REPROVAR uma alteração, e alteração reprovada não sobe mais. Até aqui a conferência apontava o problema e a alteração ia ao ar do mesmo jeito.',
      'As conferências do banco de dados deixaram de poder mentir. Uma conferência que morresse no meio do caminho era contada como "passou"; agora cada uma termina dizendo quantas verificações fez e quantas falharam, e a que não termina é reprovada.',
      'As telas ganharam a primeira rede de proteção que faltava: passou a haver conferência automática sobre o que a tela realmente entrega — o título da página, o aviso vermelho que o leitor de tela precisa anunciar na hora, e a caixa de "digite para confirmar" das ações que apagam dado.',
      'Voltou a ser conferida a cada alteração a peça que, em julho de 2026, deixou os botões de gravar fora do ar por cerca de 20 horas. A conferência existia desde então e ninguém a executava.',
    ],
  },
  {
    versao: '1.49.1',
    data: '2026-09-01',
    titulo: 'Acertos da revisão de código da F44',
    mudancas: [
      'Com apenas UM item abaixo do mínimo, o cartão "A repor" da página Itens escrevia "de 44 item abaixo do mínimo". Agora escreve "de 44 itens".',
      'Fora isso, nada mudou no que você vê: o resto foram acertos por dentro — a tabela de Itens deixou de refazer duas vezes as mesmas colunas de filial a cada carregamento, e os textos de apoio da tela passaram a ser conferidos por teste.',
    ],
  },
  {
    versao: '1.49.0',
    data: '2026-09-01',
    fase: 'F44',
    titulo: 'A página Itens diz de qual filial são os números que ela mostra',
    mudancas: [
      'Quando você filtra por uma filial, a página agora escreve de quem são os números — "Números de Linhares", em cima dos totais, e "Total, Em estoque, Em uso e Falta são de Linhares" em cima da tabela. Os números já eram daquela filial; o que faltava era a página dizer isso, e embaixo do Total ainda aparecia "tudo que a TI possui".',
      'Filtrando UMA filial, a coluna com o nome dela sai da tabela: ela repetia, com outro rótulo, o mesmo número que a coluna "Em estoque" já mostrava na mesma linha.',
      'Cada número ganhou uma cor: verde para "Em estoque", azul para "Em uso", vermelho para "Falta" e cinza para "Total" — a mesma cor no total do topo, no cabeçalho da coluna e no número de cada linha. São as mesmas cores com que a página de Ativos já mostra "em estoque" e "em uso".',
      'As linhas da tabela passaram a ser listradas e ganharam um traço separando o nome do item do bloco de números, para o olho não se perder na horizontal.',
      'O aviso "repor" passou a seguir o filtro de filial: com uma filial escolhida, ele compara o mínimo do item com o estoque DAQUELA filial, e não mais com o de todas somadas. Atenção: com uma filial filtrada, um item pode pedir reposição mesmo havendo sobra na filial ao lado — a página está falando daquela prateleira. Passar o mouse no selo mostra com qual estoque a conta foi feita.',
      'Na ficha de um equipamento, "Itens que foram junto" e "Itens faltantes da devolução" desceram para o fim da página e abrem recolhidos, com a contagem no título: primeiro vêm os dados do equipamento, os termos e a linha do tempo. Quando há item faltante em aberto, o bloco abre sozinho e mostra um aviso com a quantidade.',
    ],
  },
  {
    versao: '1.48.0',
    data: '2026-09-01',
    fase: 'F43',
    titulo: 'A página Itens diz, na própria linha, onde está cada item',
    mudancas: [
      'Cada item agora mostra, na própria linha, quanto tem em cada filial — uma coluna por filial, com o nome dela no cabeçalho. Antes esse número só existia clicando na setinha, um item por vez.',
      'No celular, a lista voltou a mostrar números. A tabela pedia mais largura do que a tela tinha, e as colunas "Em estoque" e "Em uso" ficavam fora da área visível: você via o nome do item e mais nada. Para ver os números de cada filial no celular, o botão "Ver as 5 filiais" abre a linha.',
      'Cada coluna de número passou a dizer embaixo do nome o que ela significa — "na prateleira agora", "com as pessoas". Antes isso só aparecia parando o mouse em cima, e no celular não aparecia de jeito nenhum.',
      'Acima da tabela entraram os totais da lista como ela está filtrada: Em estoque, Em uso e Total, mais "A repor" e "Falta" quando há algo a repor ou algum déficit. Esses dois dizem também quantos estão na página que você está vendo.',
      'O grupo e o tipo do item saíram de duas colunas e passaram a aparecer embaixo do nome — agora eles também aparecem no celular, onde antes sumiam por completo.',
      'O aviso "repor" ganhou um ícone de alerta, para não passar despercebido no meio da lista.',
    ],
  },
  {
    versao: '1.47.2',
    data: '2026-08-31',
    titulo: 'O link antigo do histórico de itens voltou a funcionar (de verdade)',
    mudancas: [
      'Um link antigo para o histórico de itens — daqueles com o tipo e o período no endereço, salvos nos favoritos ou colados num chamado — abria a lista de saldos ignorando o recorte. Agora ele leva para a tela de Histórico já filtrado, como deveria desde a versão 1.47.0.',
      'A tentativa da versão anterior não resolveu: o desvio funcionava no navegador, mas não valia para tudo o que abre um endereço do sistema. Ele mudou de lugar e agora vale sempre.',
      'A verificação automática que roda depois de cada publicação encontrou o problema nas duas vezes — inclusive a vez em que a correção não tinha pegado.',
    ],
  },
  {
    versao: '1.47.1',
    data: '2026-08-31',
    titulo: 'Uma primeira tentativa de consertar o link antigo do histórico — que não pegou',
    mudancas: [
      'Esta versão tentou consertar o link antigo do histórico de itens e NÃO resolveu: o diagnóstico estava errado. Ela fica registrada porque foi publicada, e porque o histórico de versões deste sistema conta o que aconteceu, não o que era para ter acontecido.',
      'Quem resolveu foi a versão 1.47.2, logo em seguida.',
    ],
  },
  {
    versao: '1.47.0',
    data: '2026-08-31',
    fase: 'F42',
    titulo: 'A tela de itens ficou igual à de equipamentos',
    mudancas: [
      'A página Itens agora é uma tabela só, com uma barra de filtros e uma paginação — do mesmo jeito que a lista de Ativos. Antes eram três telas empilhadas numa: os saldos, um botão que trocava as colunas da tabela inteira e o histórico com um segundo conjunto de filtros.',
      'Uma coluna nova: "Em uso" diz quantas unidades estão com as pessoas. Esse número sempre existiu, mas você tinha de calculá-lo de cabeça, subtraindo o que está na prateleira do total.',
      'Comparar as filiais virou a setinha no começo de cada linha: você abre o item e vê, filial por filial, quanto tem na prateleira e quanto está com as pessoas. O filtro de filial parou de sumir da tela — ele está sempre lá e vale sempre.',
      'O histórico de lançamentos ganhou tela própria, em Itens → Histórico, com o filtro de filial que antes vinha emprestado dos saldos. Chega-se por ela pelo menu, pelo botão "Histórico" no topo da página Itens ou pelo menu "⋯" da linha de um item, que já abre filtrado naquele item. Links antigos continuam funcionando: eles levam para a tela nova com o mesmo recorte.',
      'A janela de lançar quantidade ficou menor e passou a avisar ANTES de gravar quando uma unidade vai entrar por acerto automático — antes você só descobria depois.',
      'Na ficha do equipamento, os acessórios que entraram por acerto automático aparecem com o selo "regularizado", em vez de um Ajuste sem explicação.',
    ],
  },
  {
    versao: '1.46.0',
    data: '2026-08-31',
    fase: 'F41',
    titulo: 'O acessório deixou de travar a devolução do equipamento',
    mudancas: [
      'Marcar "Voltou" no checklist de uma devolução não derruba mais o registro. Antes, se o sistema não tivesse a saída daquele carregador anotada, ele recusava tudo — a devolução do notebook inclusive — e a tela dizia "Nada foi gravado". Agora ele grava a devolução, acerta a contagem do acessório sozinho e avisa numa linha o que fez.',
      'A mesma coisa vale na entrega: mandar um mouse junto com o equipamento numa filial sem estoque dele deixou de ser recusado.',
      'Você pode cadastrar um item sem sair da movimentação. No checklist, a linha que não tem item no catálogo ganhou o botão "Cadastrar", e o item nasce já com o tipo daquela linha. Nomes que só diferem por acento, maiúscula ou espaço a mais são tratados como o mesmo item.',
      'Os itens passaram a usar as mesmas palavras dos equipamentos: Compra, Saída, Devolução e Ajuste. Sumiram "Liberação", "Atrelar" e "Retorno", que eram três nomes para coisas que o resto do sistema já chamava de outro jeito. A coluna "Atrelados" agora se chama "Reservado".',
      'Escolher o tipo de um lançamento virou uma pergunta só, com quatro botões — antes eram duas perguntas encadeadas.',
      'O lançamento de vários itens de uma vez virou tudo ou nada: se uma linha for recusada, nenhuma é gravada e a tela diz qual foi. Antes metade do carrinho podia entrar sem você perceber.',
    ],
  },
  {
    versao: '1.45.1',
    data: '2026-08-31',
    titulo: 'A busca que não achava ninguém, e mais treze correções da revisão',
    mudancas: [
      'A busca das telas de Administração — Colaboradores, Fila de consolidação, Itens, Tipos de item e Usuários — voltou a achar o que você digita. Escrever o nome completo de alguém não trazia ninguém: só um pedaço da palavra, em minúsculas e sem acento, funcionava.',
      'O campo de nome da movimentação e do lançamento de item passou a reconhecer quem já está cadastrado mesmo sem o acento, e a sugerir também pelo sobrenome. Antes, digitar "Joao Silva" para uma "João Silva" cadastrada não mostrava nada e ainda escondia o botão de cadastrar — não sobrava saída na tela.',
      'Os quadros e avisos coloridos voltaram a sair com a cor certa quando você imprime. A impressão estava trocando toda moldura colorida por um cinza padrão.',
      'As caixas de aviso ganharam o mesmo canto arredondado dos outros quadros do sistema. Nenhuma cor mudou.',
      'As conferências automáticas que protegem o padrão visual passaram a enxergar trechos que antes pulavam sem avisar, e a ferramenta que mede o andamento do padrão passou a contar pela mesma régua delas.',
      'A ferramenta interna que fotografa as telas passou a subir o próprio ambiente e a exigir que você confirme para qual base está apontando — antes ela podia fotografar dados reais sem perceber.',
    ],
  },
  {
    versao: '1.45.0',
    data: '2026-08-30',
    fase: 'F40',
    titulo: 'Sistema de design: a fundação e a tela de Ativos',
    mudancas: [
      'As três telas de Ativos — a lista, a ficha do equipamento e o cadastro de compra — passaram a ter o mesmo espaçamento entre os blocos, o mesmo tamanho de título e o mesmo tipo de moldura em volta dos quadros. Antes cada uma tinha o seu.',
      'A tela de cadastrar equipamento novo deixou de ficar centralizada e passou a começar na mesma linha das outras telas. O formulário continua com a mesma largura; o que mudou é que o título e o botão "Voltar para ativos" agora se alinham com o cabeçalho do sistema.',
      'A tela cinza que aparece enquanto Ativos carrega passou a ter exatamente a largura e o ritmo da tela de verdade — some o pulinho que dava quando o conteúdo chegava.',
      'As cores dos crachás de situação e das pastilhas de tipo ganharam nome próprio. Nenhuma cor mudou: as 18 combinações foram medidas antes e depois e deram o mesmo resultado. O que muda é que agora cada cor é conferida automaticamente antes de qualquer entrega.',
      'Os textos de 11 pixels da linha do tempo subiram para 12, e duas caixas de filtro que tinham largura escolhida a dedo passaram a usar a medida padrão.',
    ],
  },
  {
    versao: '1.44.2',
    data: '2026-08-30',
    titulo: 'Revisão de projeto de sistema',
    mudancas: [
      'Movimentação registrada depois das 21h passou a ficar com a data do dia em que você registrou. Antes o sistema podia gravar a data do dia seguinte e o lançamento sumia do relatório daquele dia. Nenhum registro antigo ficou torto — o problema foi corrigido antes de acontecer com alguém.',
      'Planilha grande demais no import de startup agora é recusada com o motivo na tela: quantas linhas ela tem e qual é o limite. Antes o sistema cortava o que passava do limite sem avisar, e os equipamentos das linhas cortadas simplesmente não entravam.',
      'As telas de administração de usuários, de colaboradores e de itens, e o bloco "Com esta pessoa", passaram a consultar o banco por caminhos mais diretos.',
      'A base do sistema foi atualizada e oito alertas de segurança do fornecedor foram fechados, um deles na porta de entrada do login. Nada mudou nas telas.',
    ],
  },
  {
    versao: '1.44.1',
    data: '2026-08-29',
    titulo: 'Revisão de código da F39',
    mudancas: [
      'O aviso que aparecia ao gerar termo de devolução de um lote com equipamentos de filiais ou de pessoas diferentes dizia que "houve item conferido" mesmo quando ninguém tinha conferido nada. Agora ele diz o que de fato acontece: nesse tipo de lote, o que você marca como "Voltou" não entra na linha de componentes.',
      'A tela de registrar movimentação passou a buscar a lista de tipos de item uma vez só, em vez de duas, e o diálogo do termo de devolução faz suas três consultas ao mesmo tempo. As duas telas abrem mais rápido.',
      'O termo de devolução deixou de mostrar o aviso de lote misto quando um dos equipamentos do lote não pôde ser lido — antes isso bastava para o sistema achar que havia filiais diferentes.',
      'Os 5 modelos de termo de responsabilidade passaram a ser abertos e preenchidos de verdade durante os testes automáticos, com e sem acessórios. Modelo alterado por engano passa a ser barrado antes de chegar a um papel assinado.',
    ],
  },
  {
    versao: '1.44.0',
    data: '2026-08-29',
    fase: 'F39',
    titulo: 'O termo diz o que foi junto',
    mudancas: [
      'O termo de entrega agora lista o fone, o mouse e a mochila que saíram com o equipamento. A linha aparece no papel logo abaixo dos dados do aparelho, com a quantidade quando saiu mais de um ("Mouse (2)"), e vem pronta a partir do que você registrou em "Itens que vão junto".',
      'Entrega sem nenhum acessório continua saindo exatamente como sempre saiu: sem linha em branco e sem sobra no documento.',
      'O campo "Acessórios que acompanham" é editável como todo campo do termo. Apagar a linha faz a parte sumir do documento; digitar à mão faz aparecer.',
      'No termo de devolução, a linha "Outros componentes" deixou de sair vazia e passou a dizer o que a pessoa devolveu naquele ato. O que faltou continua na Observação, como sempre — são duas linhas diferentes, e agora o papel não deixa dúvida.',
      'Se um acessório que foi junto ainda não tem tipo cadastrado, a tela avisa antes de gerar e aponta onde classificar, em Administração → Itens. O termo sai do mesmo jeito.',
      'Os nomes dos itens conferidos na devolução passaram a vir todos do cadastro de Tipos de item. Nenhum nome mudou de lugar nem de escrita — o que muda é que agora o administrador acrescenta um tipo novo e ele aparece em todas as telas.',
    ],
  },
  {
    versao: '1.43.1',
    data: '2026-08-29',
    titulo: 'Correções da revisão de código da versão anterior',
    mudancas: [
      'Trocar um equipamento levando e trazendo o mesmo acessório no mesmo lote deixou de ser recusado. Quando a prateleira estava zerada, o registro inteiro caía com "Estoque insuficiente" mesmo que o acessório voltasse na mesma operação; agora o que volta entra antes do que sai, e o lote passa.',
      'Quando o sistema não consegue conferir o que está com a pessoa, a devolução não é mais gravada por baixo do pano sem baixar a conta dela: a tela avisa e pede para tentar de novo.',
      'O rascunho do lote parou de perder o que já tinha sido conferido: o "Voltou" da devolução da troca volta marcado, e os acessórios que iam junto continuam com o equipamento certo mesmo quando algum equipamento do rascunho não existe mais.',
      'Na devolução da troca, o aviso de que marcar "Voltou" não vai mexer no estoque (equipamentos de filiais ou pessoas diferentes) passou a aparecer também nessa metade — antes só a metade principal avisava.',
      'Desfazer uma movimentação que levou acessórios não falha mais por causa de acessório já devolvido por outro caminho.',
      'No bloco "Com esta pessoa", o aviso sobre lançamentos antigos sem cadastro agora diz que o número é do sistema inteiro — antes parecia dívida daquela pessoa.',
    ],
  },
  {
    versao: '1.43.0',
    data: '2026-08-28',
    fase: 'F38',
    titulo: 'Os acessórios andam junto com o equipamento',
    mudancas: [
      'Ao entregar um notebook, dá para registrar na mesma tela o fone, o carregador e a mochila que saem junto: a seção "Itens que vão junto" baixa cada um do estoque da filial e passa a contar na conta de quem recebeu. Com mais de um equipamento no lote, você escolhe a qual deles cada acessório acompanha. Depois, a ficha do equipamento mostra "Itens que foram junto" — a resposta para "o que saiu com este notebook", que antes não existia.',
      'Na devolução, o checklist passou a ter dois botões por acessório em vez de um. "Voltou" repõe o item no estoque da filial na hora e baixa da conta da pessoa; "Faltou" abre a pendência como sempre fez. A lista agora vem do catálogo de tipos, e não de uma lista fixa.',
      'Ao lado do checklist aparece "Com esta pessoa": o que o sistema tem registrado com quem está devolvendo. Quem ainda não está no cadastro, ou item que nunca foi registrado com a pessoa, não impede nada — marcar "Voltou" repõe o estoque do mesmo jeito, só não baixa conta de ninguém.',
      'Resolver uma pendência de item passou a mexer no estoque, e é isso que fecha a conta: "Item recuperado" devolve o acessório à prateleira e tira da conta da pessoa; "Baixa" tira da conta dela e também do total da TI. Antes, um item dado como perdido ficava na conta da pessoa para sempre.',
      'Um lote com uma linha errada não entra mais pela metade. Se qualquer equipamento do lote for recusado, nada é gravado — a tela volta com o lote inteiro e aponta qual linha parou tudo, com o motivo. Antes, as linhas anteriores já estavam registradas e sobrava reconciliar à mão.',
      'Estornar uma movimentação que levou acessórios agora desfaz os dois lados no mesmo ato: o equipamento volta ao estado anterior e os acessórios voltam para a prateleira. Se algum não puder voltar, o estorno inteiro é recusado — nunca fica metade desfeita.',
    ],
  },
  {
    versao: '1.42.1',
    data: '2026-08-28',
    titulo: 'A revisão do cadastro de pessoas e tipos de item',
    mudancas: [
      'Quando você tenta cadastrar alguém que já existe no cadastro mas está desativado, a tela agora diz a verdade. Antes ela avisava "voltou ao cadastro de colaboradores" e nada acontecia: reativar é coisa de administrador. Agora a mensagem explica isso, e a movimentação sai vinculada à pessoa certa do mesmo jeito.',
      'O botão "Cadastrar" embaixo do campo Colaborador voltou a aparecer quando o nome digitado pertence a alguém desativado. Antes ele sumia e o nome também não aparecia na lista — não havia nada a fazer na tela.',
      'A lista de nomes que aparece enquanto você digita voltou a olhar o histórico inteiro, e não só um pedaço dele: nomes que apareciam antes tinham sumido, e a lista podia mudar de uma abertura para outra. No lançamento de item ela passou a sugerir também quem só aparece no histórico de itens.',
      'Em Administração → Itens, o item classificado com um tipo que foi desativado depois mostrava a coluna "Tipo" em branco — e um clique ali trocava o tipo sem ninguém ver qual era o anterior. Agora o tipo aparece, marcado como desativado.',
      'Ao editar um colaborador ou um tipo de item, reabrir "Editar" mostrava os dados de antes da edição, e salvar de novo desfazia a correção. Os dois formulários passaram a abrir sempre com o que a lista está exibindo. Na edição de tipo, deixar a "Ordem na lista" em branco agora mantém a ordem atual, como o texto do campo promete.',
      'O cartão "Nomes sem cadastro" podia mostrar uma pendência a mais que nunca aparecia na lista e não tinha como ser resolvida — quando alguém digitava só um espaço estranho no campo. Esses casos deixaram de contar como nome de gente.',
    ],
  },
  {
    versao: '1.42.0',
    data: '2026-08-28',
    fase: 'F37',
    titulo: 'As pessoas e os tipos de item ganham cadastro',
    mudancas: [
      'Agora dá para cadastrar as pessoas que recebem os equipamentos, em Administração → Colaboradores. No campo "Colaborador" da movimentação e do lançamento de item, os nomes já cadastrados aparecem na lista enquanto você digita — e quem não estiver lá pode ser cadastrado ali mesmo, pelo botão que aparece embaixo do campo.',
      'Nada ficou obrigatório: digitar um nome que não está no cadastro continua salvando a movimentação do mesmo jeito, exatamente como antes. O nome também continua sendo guardado como você escreveu, no registro daquele dia.',
      'A mesma tela mostra a fila dos nomes que já foram digitados à mão e ainda não têm cadastro, juntando as grafias da mesma pessoa: "João Silva", "JOAO SILVA" e "joão  silva" aparecem como uma linha só, com a quantidade de registros em que cada nome aparece. Dá para transformar em cadastro várias de uma vez. Nenhuma movimentação já registrada é alterada por isso — o histórico continua como está.',
      'O campo "Colaborador" do lançamento de item, que era só uma caixa de texto sem nenhuma sugestão, passou a funcionar como o da movimentação.',
      'Administração ganhou a aba "Tipos de item" — carregador, mochila, fone de ouvido —, e cada item do catálogo pode receber um tipo direto na lista, em Administração → Itens. Preencher é opcional; um aviso mostra quantos itens ainda estão sem tipo.',
      '"Fone" passou a se chamar "Fone de ouvido" em todas as telas, inclusive nas pendências antigas. Só o nome mudou; o que estava registrado continua igual.',
    ],
  },
  {
    versao: '1.41.0',
    data: '2026-08-28',
    fase: 'F36',
    titulo: 'O equipamento volta para o estoque sem dono',
    mudancas: [
      'Quando um equipamento vai para um estado em que ninguém está com ele — em estoque, em triagem, em manutenção, defasado, descartado ou devolvido ao fornecedor —, o colaborador e o setor saem da ficha junto. Antes isso só acontecia em alguns caminhos: quem usava "Ajuste" para acertar o estado deixava o equipamento na prateleira ainda "com o Fulano".',
      'A mesma correção vale para o relatório de uma data passada. O estado ao vivo e a leitura da data escolhida diziam coisas diferentes sobre quem estava com o equipamento; agora dizem a mesma coisa. Isso muda o que alguns relatórios antigos mostram: 21 registros de julho e agosto deixam de exibir um responsável que já não existia.',
      'Quatro equipamentos que estavam nessa situação foram limpos, sem inventar movimentação nenhuma para isso — o histórico deles continua exatamente como está.',
      'Nos três estados em que alguém realmente está com o equipamento — em uso, emprestado e reservado — nada mudou: o responsável continua na ficha, a transferência entre filiais leva o responsável junto, e "Estornar" continua devolvendo tudo como estava, inclusive quem estava com ele.',
      'A tela de manutenção do sistema ganhou uma décima conferência, que acusa qualquer equipamento sem dono que ainda apareça com um nome colado. Em operação normal ela marca zero.',
    ],
  },
  {
    versao: '1.40.5',
    data: '2026-08-19',
    titulo: 'A revisão das duas últimas entregas',
    mudancas: [
      'O arquivo de Excel do histórico de lançamentos passou a trazer a quantidade com o MESMO sinal que a tela mostra: uma Liberação de 3 sai como −3, e não mais como 3. Quem somava aquela coluna para conferir o estoque vinha obtendo um total errado.',
      'A prévia do lançamento parou de dar a entender que uma Devolução ou um Retorno passariam só porque cabem na prateleira — ela avisa que a quantidade ainda em aberto no chamado é conferida na hora de salvar.',
      'Digitar uma quantidade negativa fora do Acerto de contagem explica o problema ali mesmo. Antes a prévia simplesmente sumia da linha, sem dizer nada, e o erro só aparecia depois de clicar em Lançar.',
      'O alerta "Diga o que aconteceu" não reaparece mais sozinho ao reabrir o formulário depois de desistir — inclusive quando se fecha pelo botão Cancelar. E o Colaborador voltou a dizer "(opcional)" na Liberação, num campo que continua sendo opcional.',
      'Abrir a tela de Itens deixou de consultar os saldos por conta própria: isso agora só acontece quando alguém abre o formulário de lançar.',
      'Os relatórios de acervo muito grande deixaram de acusar erro numa leitura que tinha dado certo, ficaram um pouco mais rápidos, e as consultas em bloco ganharam limite de quantas vão ao mesmo tempo para não sobrecarregar o sistema nas telas mais pesadas.',
    ],
  },
  {
    versao: '1.40.4',
    data: '2026-08-19',
    titulo: 'Lançar itens virou responder o que aconteceu',
    mudancas: [
      'Lançar um item deixou de ser escolher entre seis nomes parecidos: o formulário pergunta "O que aconteceu?" — Chegou, Saiu da prateleira, Voltou à prateleira ou Acerto de contagem — e, no saiu/voltou, se a peça estava com uma pessoa ou atrelada a um chamado. O par certo (Liberação volta como Retorno; Atrelar volta como Devolução) sai da resposta, sem decorar vocabulário.',
      'O formulário não abre mais pré-marcado em "Entrada": sem responder o que aconteceu, nada é gravado. Antes, quem não tocava no campo registrava uma entrada sem querer — e o estoque subia quando devia descer.',
      'Cada linha do lançamento mostra a prévia "Estoque na filial: 14 → 12" antes de salvar, e avisa ali mesmo quando a quantidade passa do que existe na prateleira — em vez de recusar só depois do envio.',
      'No histórico de lançamentos, o sinal da coluna Qtd. passou a ser o efeito no estoque: uma Liberação de 3 aparece como −3 (saiu da prateleira), não mais como +3. O filtro de tipo ganhou os mesmos grupos do formulário.',
      'A recusa por falta de chamado fala os nomes das telas — "Atrelar e Devolução exigem o número do chamado" — em vez dos nomes internos que apontavam para o campo errado.',
    ],
  },
  {
    versao: '1.40.3',
    data: '2026-08-17',
    titulo: 'A revisão da correção do corte de 1.000',
    mudancas: [
      'A trava que impede o sistema de contar só os primeiros 1.000 equipamentos deixou de depender de um ajuste do servidor que ninguém aqui controla. Se esse ajuste mudasse, a contagem voltaria a parar cedo em silêncio — agora não volta.',
      'Uma leitura longa que passe do limite de segurança acusa erro na tela, em vez de mostrar um número menor com cara de certo. Falhar à vista é melhor que um total errado que ninguém desconfia.',
      'As telas de relatório de períodos longos ficaram mais rápidas: as consultas que buscam equipamentos em blocos agora vão todas ao mesmo tempo, em vez de cada bloco esperar o anterior terminar.',
      'A tela de manutenção do sistema abre mais rápido e parou de carregar todo o histórico de lançamentos de estoque só para mostrar quantos lançamentos cada item tem.',
      'Quando um relatório antigo é corrigido e republicado, a lista de pendências daquela semana é preservada como estava — antes ela era substituída pela lista de hoje. O aviso da correção passou a dizer isso, e também que marca, modelo e patrimônio aparecem como estão hoje.',
    ],
  },
  {
    versao: '1.40.2',
    data: '2026-08-17',
    titulo: 'Os relatórios voltaram a contar o acervo inteiro',
    mudancas: [
      'O comparativo do relatório voltou a contar o acervo inteiro: o total da semana anterior parava em 1.000 equipamentos, e a diferença entre as semanas aparecia como um salto de centenas de itens que nunca entraram.',
      'Quem escolhe uma data passada — no relatório de uma filial ou no consolidado — passou a ver todos os equipamentos daquele dia, e não só os 1.000 primeiros. Isso vale para os quadros de categoria, de disponíveis por modelo, de reservados e de manutenção.',
      'O relatório da semana de 3 a 7 de agosto foi refeito: a versão congelada dizia 1.000 equipamentos e agora diz 1.648. A versão antiga continua guardada e marcada como superada.',
      'A linha do tempo da ficha do equipamento e a última observação de cada item de estoque também passaram a mostrar o histórico completo, sem corte.',
    ],
  },
  {
    versao: '1.40.1',
    data: '2026-08-12',
    titulo: 'Acertos de revisão na tela de versões e no menu do celular',
    mudancas: [
      'No celular, tocar no número da versão no pé do menu passou a fechar a gaveta — antes o menu ficava por cima da tela que acabara de abrir.',
      'Na tela Versões, o código miúdo da entrega ficou mais legível, e o que ele significa passou a vir escrito no alto da página em vez de aparecer só para quem usa mouse.',
      'A ajuda passou a descrever o pé do menu lateral: o número da versão, o nome de quem desenvolve o sistema e a tela que o número abre.',
      'Uma trava interna passou a exigir que toda entrega registrada no histórico tenha a sua própria versão, mesmo quando duas saem no mesmo dia.',
    ],
  },
  {
    versao: '1.40.0',
    data: '2026-08-12',
    fase: 'F35',
    titulo: 'O sistema passa a dizer em que versão está, e o que mudou em cada uma',
    mudancas: [
      'O rodapé do menu lateral mostra a versão do sistema; clicar nela abre o histórico completo.',
      'Nova tela Versões, com todas as versões desde o início, cada uma com a data e o que mudou.',
      'A página de ajuda "Versões do sistema" explica como ler o histórico e onde encontrá-lo.',
    ],
  },
  {
    versao: '1.39.1',
    data: '2026-08-11',
    titulo: 'Revisão interna de qualidade das últimas atualizações',
    mudancas: [
      'Uma correção evita que uma nova reserva apague, em silêncio, o nome de quem está com o equipamento.',
      'A ajuda foi corrigida em quatro pontos onde o texto já não descrevia o comportamento atual.',
    ],
  },
  {
    versao: '1.39.0',
    data: '2026-08-11',
    fase: 'F34',
    titulo: 'Devolução volta direto ao estoque, e o reservado pode trocar de dono',
    mudancas: [
      'A devolução volta direto para o estoque, sem passar pela triagem obrigatória.',
      'Quem quiser conferir o equipamento antes registra "Envio para triagem", que agora é um tipo próprio.',
      'Dá para trocar o colaborador ou o setor de um equipamento reservado sem estornar e refazer a reserva.',
      'Nos cards de manutenção, o chamado interno e o do fornecedor aparecem sempre, com "—" quando não informados.',
    ],
  },
  {
    versao: '1.38.0',
    data: '2026-08-10',
    fase: 'F33',
    titulo: 'Sistema muito mais rápido nas telas de operação',
    mudancas: [
      'As telas do dia a dia responderam de 65% a 74% mais rápido: relatório consolidado, ficha do ativo e tela inicial.',
      'A causa era o sistema montar as telas do outro lado do mundo; agora ele monta perto dos dados, no Brasil.',
      'Nenhuma tela mudou de aparência ou de comportamento — só a velocidade.',
    ],
  },
  {
    versao: '1.37.0',
    data: '2026-08-10',
    fase: 'F32',
    titulo: 'Relatório mais legível, clicável e com curva de estoque',
    mudancas: [
      'As cores de situação foram trocadas para quem não distingue certos tons: triagem, reservado e emprestado mudaram.',
      'Clicar numa barra de motivo filtra a tabela de Saídas ou Entradas correspondente e rola até ela.',
      'Clicar num pedaço do gráfico de situação abre a lista de Ativos já filtrada.',
      'Novo card "Evolução do estoque", com a curva semana a semana dentro do período.',
      'A tabela de saldo por item ganhou um medidor verde, âmbar ou vermelho comparando estoque e mínimo.',
      'O horário de "Atualizado às" ficou sempre visível, inclusive no papel.',
    ],
  },
  {
    versao: '1.36.0',
    data: '2026-08-09',
    fase: 'F31',
    titulo: 'Transferência de itens entre filiais e modo Conferência',
    mudancas: [
      'Dá para transferir itens entre filiais numa tela só, e o Total da TI para de inflar a cada remanejamento.',
      'A transferência é tudo ou nada: se faltar saldo numa das pontas, nada é gravado.',
      'Novo modo Conferência para contar a prateleira de uma filial e registrar todas as diferenças de uma vez.',
      'A contagem fica salva no aparelho: recarregar a página no meio não perde o trabalho nem duplica lançamento.',
      'Estornar só um lado de uma transferência avisa que a operação fica pela metade, antes de confirmar.',
    ],
  },
  {
    versao: '1.35.0',
    data: '2026-08-09',
    fase: 'F30',
    titulo: 'Seleção múltipla na lista, impressão completa e menu que recolhe',
    mudancas: [
      'Dá para marcar vários ativos na lista e mandar todos juntos para uma nova movimentação.',
      'Quem fica de fora da seleção é avisado pelo patrimônio: apagado, endereço quebrado ou acima do teto de 30.',
      'O relatório impresso voltou a trazer Marca/Modelo, Colaborador/Setor, Chamado, Termo e Observação, que sumiam no papel.',
      'O menu lateral recolhe e devolve espaço à tela, pela tecla de colchete ou pelo botão no pé do menu.',
      'Com o menu recolhido, o aviso de pendências continua visível sobre o ícone.',
    ],
  },
  {
    versao: '1.34.0',
    data: '2026-08-07',
    fase: 'F29',
    titulo: 'Relatórios que se navegam, administração que se encontra',
    mudancas: [
      'O relatório ganhou o atalho "Semana passada", que era o recorte digitado à mão toda segunda-feira.',
      'Congelar o relatório abre no período que está na tela e avisa qual versão daquele período já existe.',
      'A lista de relatórios gerados pagina, marca a versão superada e leva ao período anterior e ao próximo.',
      'Os gráficos empilhado e divergente passaram a mostrar o valor ao passar o mouse.',
      'Usuários e o catálogo de Itens ganharam busca por nome, e-mail, cargo, filial ou grupo.',
      'A senha de acesso ao relatório pode ser copiada junto do link e conferida depois, sem revogar.',
    ],
  },
  {
    versao: '1.33.0',
    data: '2026-08-07',
    fase: 'F28',
    titulo: 'A rotina diária: revisão completa, fila que age na linha e histórico auditável',
    mudancas: [
      'A Revisão do lote passou a mostrar a data do lançamento junto de motivo, colaborador, termo e chamado.',
      'O aviso de equipamento de outra filial nasce já na montagem do lote, e não só na hora de gravar.',
      'Movimentações ganhou os atalhos Hoje, Ontem e 7 dias, mais o filtro "Minhas".',
      'A fila de Pendências resolve na própria linha e assina vários termos de uma vez, com data única.',
      'Pendência resolvida por engano pode ser reaberta com justificativa, pelo nível Administrador.',
      'O histórico de Itens diz quem levou, quem lançou e o saldo depois de cada movimento.',
    ],
  },
  {
    versao: '1.32.0',
    data: '2026-08-07',
    fase: 'F27',
    titulo: 'Sessão expirada devolve ao lugar certo e cada tela ganha nome próprio',
    mudancas: [
      'Depois de a sessão expirar, entrar de novo devolve para a tela e os filtros em que se estava.',
      'Cada tela passou a ter nome próprio na aba do navegador, com o patrimônio na ficha do ativo.',
      'Campo obrigatório em falta rola a tela até o aviso e coloca o foco nele, em vez de errar fora da vista.',
      'A busca da lista de Ativos passou a achar também por service tag, hostname, telefone e IMEI.',
      'O termo herda a data da movimentação retroativa, em vez de sugerir sempre a data de hoje.',
      'Excluir item do catálogo passou a pedir confirmação.',
    ],
  },
  {
    versao: '1.31.0',
    data: '2026-08-04',
    fase: 'F26',
    titulo: 'Troca de equipamento: devolução e entrega do novo numa tela só',
    mudancas: [
      'Com o motivo Troca/upgrade, a mesma tela abre a metade oposta: devolveu o antigo, já lança a saída do novo.',
      'Um único "Registrar" grava a troca inteira, sem percorrer o fluxo duas vezes.',
      'O colaborador vem preenchido quando todos os equipamentos devolvidos estão com a mesma pessoa.',
      'Dá para deixar a outra metade para depois, com um atalho pronto na tela de sucesso.',
      'Cada metade gera o documento certo: termo de responsabilidade de quem recebe, termo de devolução de quem devolveu.',
    ],
  },
  {
    versao: '1.30.0',
    data: '2026-08-04',
    fase: 'F25',
    titulo: 'Celular com campos próprios, cidade certa no termo e filtro de filial por cargo',
    mudancas: [
      'Número, IMEI e Pulsus do celular viraram campos do ativo e já preenchem o termo, em vez de texto solto.',
      'O termo passou a trazer a cidade da filial na linha da assinatura, e não mais sempre São José dos Pinhais.',
      'O filtro de filial virou seleção múltipla em Ativos, Movimentações, Itens, Pendências e relatórios gerados.',
      'Quem opera entra com as filiais em que escreve já marcadas; os demais cargos continuam vendo todas.',
      'O catálogo de Itens abre na visão por filial, com o consolidado a um clique.',
    ],
  },
  {
    versao: '1.29.0',
    data: '2026-07-30',
    fase: 'F24',
    titulo: 'Importação não trava mais por duplicidade entre filiais',
    mudancas: [
      'Linha cujo equipamento já existe em OUTRA filial deixou de bloquear a importação inteira: ela entra.',
      'O par duplicado vira a pendência "conflito entre filiais", com uma mesa própria dentro de Pendências.',
      'Na mesa, os dois cadastros aparecem lado a lado, com os campos diferentes realçados e o histórico de cada um.',
      'De lá o nível Administrador apaga o cadastro errado — um, vários ou ambos —, com justificativa obrigatória.',
      'A importação continua sem transferir equipamento de uma filial para outra.',
    ],
  },
  {
    versao: '1.28.0',
    data: '2026-07-30',
    fase: 'F23',
    titulo: 'Zona destrutiva do cargo Desenvolvedor: apagar, resetar e forçar',
    mudancas: [
      'Só o cargo Desenvolvedor vê a nova Zona destrutiva, separada do resto para não ser clicada por engano.',
      'Apagar ativo, movimentação ou item exige confirmação digitada e justificativa, e gera cópia de segurança.',
      'O registro de auditoria é gravado junto com a exclusão: nunca fica uma exclusão sem rastro.',
      'Corrigido um risco real: apagar "a última movimentação" podia escolher a errada quando duas eram do mesmo instante.',
    ],
  },
  {
    versao: '1.27.0',
    data: '2026-07-30',
    fase: 'F22',
    titulo: 'Novo cargo Desenvolvedor, gestão de conta e área própria',
    mudancas: [
      'Nasceu um quarto cargo, acima de Administrador: o Desenvolvedor. Ninguém abaixo dele mexe em quem é Desenvolvedor.',
      'Trocar o e-mail de login, encerrar as sessões de alguém e apagar uma conta deixaram de exigir o painel do provedor.',
      'Apagar uma conta arquiva o perfil e preserva a história: movimentações, termos e eventos seguem mostrando quem fez.',
      'Nova área Desenvolvedor, com diagnóstico do que está no ar, checagens de integridade e auditoria completa com exportação.',
    ],
  },
  {
    versao: '1.26.0',
    data: '2026-07-29',
    fase: 'F21',
    titulo: 'Cargos, vínculo de filiais e controle de usuários',
    mudancas: [
      'Todo mundo que entrava podia tudo. Agora há três cargos: Consulta só lê, Operador registra, Administrador administra.',
      'O Operador escreve apenas nas filiais vinculadas a ele; a leitura continua ampla para todos.',
      'Dá para desativar um usuário em Administração, e o acesso cai no carregamento de tela seguinte.',
      'Toda ação administrativa passou a ficar registrada numa trilha de auditoria.',
    ],
  },
  {
    versao: '1.25.0',
    data: '2026-07-28',
    fase: 'F20B',
    titulo: 'Nome oficial do arquivo do termo e "Tentar novamente" que tenta',
    mudancas: [
      'O termo baixa como "tipo - patrimônio - colaborador", com acentos e espaços preservados.',
      'Termos gerados antes da mudança também baixam com o nome novo, sem precisar gerar de novo.',
      'O botão "Tentar novamente" das telas com erro voltou a refazer a leitura, em vez de não fazer nada.',
    ],
  },
  {
    versao: '1.24.3',
    data: '2026-07-25',
    titulo: 'Revisão interna encontra e corrige falhas silenciosas',
    mudancas: [
      'A lista de Ativos podia repetir ou pular linhas ao virar de página; a ordem ficou estável.',
      'Um filtro de Pendências prometia um grupo que a aba não mostrava; os dois lados foram alinhados.',
      'Quatro casos em que um erro passava em silêncio e a tela mostrava informação errada foram corrigidos.',
    ],
  },
  {
    versao: '1.24.2',
    data: '2026-07-25',
    titulo: 'Ajustes internos de segurança e de data',
    mudancas: [
      'A data "desde" da fila de Pendências aparecia um dia atrasada em algumas linhas; foi corrigida.',
      'Nenhum número de produção mudou: mesma quantidade de ativos e movimentações antes e depois.',
    ],
  },
  {
    versao: '1.24.1',
    data: '2026-07-25',
    titulo: 'Relatório deixa de ficar minutos tentando carregar',
    mudancas: [
      'O relatório por filial podia ficar até cinco minutos tentando carregar; agora desiste rápido e mostra o erro.',
      'A cópia do sistema usada para testar estava com permissões mais abertas que a que a equipe usa; as duas foram alinhadas.',
    ],
  },
  {
    versao: '1.24.0',
    data: '2026-07-24',
    fase: 'F20',
    titulo: 'A ajuda virou a documentação do operador',
    mudancas: [
      'A Ajuda deixou de ser uma página única e virou 33 páginas organizadas por intenção.',
      'Ganhou busca no índice, grupo próprio na busca global e um manual completo para imprimir.',
      'O "?" de cada tela passou a abrir a página daquela tela, em 16 telas.',
      'Endereços de ajuda salvos antes da mudança continuam levando ao lugar certo.',
    ],
  },
  {
    versao: '1.23.1',
    data: '2026-07-24',
    titulo: 'Quem aceita o convite informa o próprio nome',
    mudancas: [
      'Ao aceitar o convite, a pessoa informa nome e sobrenome junto com a senha, em vez de aparecer só pelo e-mail.',
      'Quem já tinha nome cadastrado não teve nada alterado.',
    ],
  },
  {
    versao: '1.23.0',
    data: '2026-07-24',
    fase: 'F19-UX',
    titulo: 'Modo escuro opcional e correções de acessibilidade',
    mudancas: [
      'Novo modo escuro, desligado por padrão: escolha Claro, Escuro ou Sistema no menu do usuário.',
      'A impressão do relatório sai sempre no modo claro, mesmo com o modo escuro ligado na tela.',
      'Telas que não avisavam quando algo dava errado ao salvar passaram a mostrar o aviso.',
      'O botão "Voltar para ativos", na ficha, passou a preservar os filtros da lista.',
    ],
  },
  {
    versao: '1.22.0',
    data: '2026-07-24',
    fase: 'F19',
    titulo: 'Auditoria das regras do sistema corrige um erro de estoque e fecha uma brecha',
    mudancas: [
      'Auditoria regra a regra comparou o que estava especificado com o que o sistema faz: 209 regras conferidas.',
      'Corrigido um erro em que o relatório de período passado podia mostrar como "em estoque" quem não estava.',
      'Fechada uma brecha de baixo risco no cadastro de compra em lote.',
    ],
  },
  {
    versao: '1.21.0',
    data: '2026-07-24',
    fase: 'F18',
    titulo: 'Item faltante na devolução vira pendência com vida própria',
    mudancas: [
      'Item que não voltou na devolução virou pendência própria, presa à devolução e ao colaborador da época.',
      'O equipamento circula livre: se sair para outra pessoa, a pendência continua apontando quem devia.',
      'A pendência se encerra por "Item recuperado" ou "Baixa — não vai voltar", uma a uma ou em lote.',
      'A resolvida sai da fila e continua visível na ficha, com quem resolveu e quando.',
    ],
  },
  {
    versao: '1.20.1',
    data: '2026-07-24',
    titulo: 'Equipamento importado não é mais cobrado por termo pendente',
    mudancas: [
      'Equipamento que entrou pela importação inicial deixou de aparecer como termo pendente na fila e no relatório.',
      'O cadastro manual continua exigindo o termo normalmente, e ainda dá para gerar o termo de um importado.',
    ],
  },
  {
    versao: '1.20.0',
    data: '2026-07-24',
    fase: 'F17',
    titulo: 'Relatório que se explica sozinho',
    mudancas: [
      'Setas, cores e selos ganharam legenda na própria tela, no relatório ao vivo e nos congelados.',
      'A legenda de manutenção diz o que cada cor significa: em andamento, parado, retornou ou devolvido ao fornecedor.',
      'Linhas estornadas ganharam a nota de que a contagem continua incluindo a movimentação original.',
      'Nova seção recolhível "Como ler este relatório", com o glossário dos indicadores.',
    ],
  },
  {
    versao: '1.19.0',
    data: '2026-07-23',
    fase: 'F16',
    titulo: 'Relatório mais fácil de ler e de navegar',
    mudancas: [
      'Movimentações estornadas aparecem esmaecidas nas tabelas, sem mudar nenhuma contagem.',
      'A variação dos indicadores ganhou cor com sentido: verde melhora, vermelho piora, cinza neutro.',
      'Cada tabela ganhou busca livre, e o patrimônio virou link direto para a ficha.',
      'Os indicadores do topo viraram atalho para a lista de Ativos já filtrada.',
      'No celular, uma setinha por linha abre os campos que a tabela esconde.',
      'Manutenção parada há 30 dias ou mais passou a aparecer em vermelho, com contagem em Pendências.',
    ],
  },
  {
    versao: '1.18.0',
    data: '2026-07-23',
    fase: 'F15',
    titulo: 'Correções do primeiro uso real da devolução ao fornecedor',
    mudancas: [
      'O cadastro manual de equipamento passou a exigir a service tag em todas as categorias.',
      'A ficha ganhou "Definir service tag" para preencher quando ela veio vazia da importação.',
      'O painel de sucesso da devolução ao fornecedor parou de sumir logo depois de registrar.',
      'O equipamento que substitui outro aparece como "Troca", e nunca mais como "Compra".',
    ],
  },
  {
    versao: '1.17.0',
    data: '2026-07-23',
    fase: 'F14',
    titulo: 'Manutenção com fornecedor: chamado, devolução e substituto',
    mudancas: [
      'Enviar para manutenção passou a exigir o número do chamado do fornecedor.',
      'Nasceu a situação "Devolvido ao fornecedor", para quando o equipamento não volta consertado.',
      'A devolução ao fornecedor e o cadastro do substituto acontecem num único registrar.',
      'A ficha do novo mostra o histórico do que ele substituiu, e a do antigo aponta para o sucessor.',
    ],
  },
  {
    versao: '1.16.0',
    data: '2026-07-23',
    fase: 'F13',
    titulo: 'Correção da falha que impedia o sistema de gravar',
    mudancas: [
      'Uma falha grave deixou o sistema sem gravar nada por algumas horas: movimentação, cadastro, administração e importação.',
      'A causa foi corrigida, e duas checagens automáticas novas impedem que o mesmo defeito volte sem ser notado.',
      'O "?" das telas voltou a abrir a ajuda na seção certa, em vez de parar no topo.',
      'As listas e o relatório deixaram de rolar para o lado no celular.',
      'Corrigida uma falha de segurança: a tela de definir senha podia, em caso raro, levar a senha para o endereço da página.',
    ],
  },
  {
    versao: '1.15.0',
    data: '2026-07-23',
    fase: 'F12',
    titulo: 'Estoque mínimo, kits de movimentação e a auditoria do que foi ao ar sem conferência',
    mudancas: [
      'O catálogo de itens ganhou o campo Estoque mínimo, com o selo "repor" quando o total cai abaixo dele.',
      'Novo card "Itens para repor" na tela inicial, com os mais urgentes primeiro.',
      'Administração ganhou a tela de Kits: "Aplicar kit" preenche de uma vez os quatro campos da movimentação.',
      'Corrigido: a fila de Pendências caía ao receber um número de página fora da faixa.',
      'Corrigido: a busca de Movimentações não achava patrimônio fora do formato padrão.',
    ],
  },
  {
    versao: '1.14.0',
    data: '2026-07-22',
    fase: 'F11',
    titulo: 'Busca global, lista de Movimentações e tabelas decentes',
    mudancas: [
      'Nasceu a tela Movimentações, com o histórico inteiro, filtros de período, tipo e filial, e busca.',
      'Busca global pelo Ctrl+K ou pela lupa do topo, achando por patrimônio, service tag, hostname, marca ou colaborador.',
      'A tecla "?" abre a ajuda, e o ícone de cada tela já leva à seção certa.',
      'A lista de Ativos ganhou ordenação por coluna e escolha de 25, 50 ou 100 por página.',
      'Itens ganhou a visão "Por filial", com o saldo de cada filial lado a lado.',
      'Os filtros das tabelas do relatório passaram a viajar no link.',
    ],
  },
  {
    versao: '1.13.0',
    data: '2026-07-22',
    fase: 'F10',
    titulo: 'Operação em massa: colar a lista, sugestões e rascunho salvo',
    mudancas: [
      'Dá para colar ou bipar a lista inteira de patrimônios de uma vez, em vez de buscar equipamento por equipamento.',
      'O lote cresceu de 10 para 30 ativos, então 15 monitores não exigem mais duas rodadas.',
      'Sair da tela no meio do preenchimento parou de perder o lote: dá para restaurar o rascunho ao voltar.',
      'Aviso âmbar quando o mesmo equipamento já teve saída no dia, sem travar o registro.',
      'Marca, Modelo e Fornecedor sugerem o que já existe, e dá para repetir a última compra ou comprar outro igual.',
      'Ativos, Pendências e Itens ganharam exportação em CSV respeitando os filtros da tela.',
    ],
  },
  {
    versao: '1.12.1',
    data: '2026-07-22',
    titulo: 'Login liberado para os e-mails da Stefanini',
    mudancas: [
      'Contas @stefanini.com e @latam.stefanini.com passaram a poder entrar no sistema.',
      'O acesso é o mesmo de quem usa @wap.ind.br.',
    ],
  },
  {
    versao: '1.12.0',
    data: '2026-07-22',
    fase: 'F9',
    titulo: 'Facilidades do dia a dia: buscar por nome, colar do Excel e contadores',
    mudancas: [
      'A busca da movimentação passou a achar o equipamento também pelo nome do colaborador.',
      'Colar a lista da compra aceita colunas separadas por tabulação ou ponto e vírgula, e não só por vírgula.',
      'A conferência da compra avisa na hora quando duas linhas repetem patrimônio ou service tag.',
      'Atalhos Hoje e Ontem nos campos de data, e memória da última filial e categoria usadas.',
      'O menu lateral passou a mostrar a quantidade de pendências, e os cards da tela inicial levam à lista já filtrada.',
      'Copiar o patrimônio da ficha ou da lista virou um clique.',
    ],
  },
  {
    versao: '1.11.1',
    data: '2026-07-21',
    titulo: 'Manutenção interna de segurança, qualidade e documentação',
    mudancas: [
      'Revisão de segurança fechou acessos a dados internos que estavam mais abertos do que deveriam.',
      'Passou a existir uma conferência automática do banco de dados a cada mudança do sistema.',
      'Nenhuma tela do dia a dia mudou.',
    ],
  },
  {
    versao: '1.11.0',
    data: '2026-07-20',
    fase: 'F7K',
    titulo: 'Modelo que repetia a marca aparece certo em toda tela',
    mudancas: [
      'Modelo que já trazia a marca junto (marca HP, modelo "HP Pro SFF 280 G9") deixou de virar "HP HP…" no rótulo.',
      'A correção acontece na importação, então todas as telas passam a mostrar o nome certo.',
    ],
  },
  {
    versao: '1.10.0',
    data: '2026-07-20',
    fase: 'F7J',
    titulo: 'Importação: patrimônio curto, patrimônio forçado e "Sem patrimônio"',
    mudancas: [
      'O nome do computador passou a completar também o patrimônio com menos dígitos, para os prefixos conhecidos.',
      'Valor fora do padrão pode ser forçado e entra como patrimônio de verdade, ainda que não canônico.',
      'O botão "Sem patrimônio" limpa o campo e manda o equipamento para a fila de pendências.',
    ],
  },
  {
    versao: '1.9.1',
    data: '2026-07-20',
    titulo: 'Importação completa o patrimônio pelo nome do computador, sozinha',
    mudancas: [
      'O preenchimento do patrimônio pelo nome do computador virou correção automática, sem virar aviso a resolver.',
      'Passou a valer também quando o patrimônio da planilha está fora do formato, e o valor original fica registrado.',
      'Toda forma escrita de "não tem plaqueta" importa vazio e vira pendência, em vez de travar a linha.',
    ],
  },
  {
    versao: '1.9.0',
    data: '2026-07-20',
    fase: 'F8',
    titulo: 'Compra de abertura da importação volta a ser só ponto de partida',
    mudancas: [
      'A compra que a importação cria para abrir a história do equipamento voltou a ficar fora das Entradas do período.',
      'A data real da entrega continua na ficha e na linha do tempo — o que mudou foi só a contagem do relatório.',
      'Isso desfaz a mudança da versão anterior, que tinha inflado as Entradas com a carga inicial.',
    ],
  },
  {
    versao: '1.8.0',
    data: '2026-07-20',
    fase: 'F7H',
    titulo: 'Compra da importação com data real passa a contar como Entrada',
    mudancas: [
      'A compra criada pela importação passou a entrar nas Entradas do relatório quando tinha data real de entrega.',
      'A mudança durou horas: a versão seguinte a desfez, porque a carga inicial inflava as Entradas do período.',
    ],
  },
  {
    versao: '1.7.0',
    data: '2026-07-20',
    fase: 'F7G',
    titulo: 'Importação lê a planilha do Excel direto',
    mudancas: [
      'A tela de importação passou a ler o arquivo do Excel original, sem exigir conversão para CSV.',
      'Cerca de 355 datas da Matriz que se perdiam na conversão voltaram a chegar corretas.',
    ],
  },
  {
    versao: '1.6.0',
    data: '2026-07-17',
    fase: 'F7F',
    titulo: 'Importação com erro em português e correção em massa mais esperta',
    mudancas: [
      'O erro do "Substituir tudo" passou a ser explicado em português, e não por um código técnico.',
      'Patrimônio ausente passou a ser completado pelo nome do computador, com aviso âmbar conferível.',
      '"Aplicar tudo" passou a incluir também os grupos só parcialmente corrigidos.',
      'Aviso deixou de ser mostrado como erro: ganhou cor âmbar própria, distinta do vermelho.',
    ],
  },
  {
    versao: '1.5.0',
    data: '2026-07-17',
    fase: 'F7E',
    titulo: 'Importação: data no formato dia/mês e patrimônio vazio sem travar',
    mudancas: [
      'Data de entrega escrita como dia/mês passou a assumir o ano certo e a datar o acerto de estoque.',
      'Patrimônio vazio deixou de travar a linha: o equipamento entra e vira a pendência "sem patrimônio físico".',
      'Erros do mesmo tipo passaram a aparecer num card só, com sugestão de correção em um clique.',
    ],
  },
  {
    versao: '1.4.0',
    data: '2026-07-17',
    fase: 'F7B',
    titulo: 'Erros da importação se corrigem na tela, e não na planilha',
    mudancas: [
      'Erros e avisos passaram a ser corrigidos na própria conferência, antes de importar.',
      'Valores iguais se corrigem em massa, com sugestão de qual é o valor certo.',
      'Toda correção pode ser desfeita, e o arquivo original nunca é alterado.',
    ],
  },
  {
    versao: '1.3.0',
    data: '2026-07-16',
    fase: 'F7',
    titulo: 'Nasce a importação da planilha inicial de uma filial',
    mudancas: [
      'Nova tela para carregar de uma vez a planilha inicial de uma filial inteira.',
      'A importação mostra antes o que vai acontecer, faz cópia de segurança e pede o nome da filial como confirmação.',
      'É só para abrir uma filial nova no sistema: a entrada do dia a dia continua sendo manual.',
    ],
  },
  {
    versao: '1.2.0',
    data: '2026-07-16',
    fase: 'F6B',
    titulo: 'Melhorias de uso logo depois do go-live',
    mudancas: [
      'As telas passaram a mostrar barra de progresso e esqueleto enquanto carregam.',
      'A semana do relatório passou a começar no domingo, e o relatório congelado ganhou campo de observação.',
      'Dá para confirmar ou desfazer a assinatura de um termo, e corrigir o patrimônio depois do cadastro.',
      'A sessão passou a durar 24 horas, e nasceu a página de Ajuda.',
    ],
  },
  {
    versao: '1.1.0',
    data: '2026-07-16',
    fase: 'F6A',
    titulo: 'Correções da primeira semana em produção',
    mudancas: [
      'A carga inicial deixou de aparecer misturada nas Entradas do relatório do período.',
      'Itens ganhou a distinção entre Total e Estoque, que estavam sendo somados como a mesma coisa.',
      'Nasceu a tela de Pendências, e as pendências passaram a aparecer só para quem opera.',
    ],
  },
  {
    versao: '1.0.0',
    data: '2026-07-15',
    fase: 'F4',
    titulo: 'Go-live: os dados reais das cinco filiais entram no sistema',
    mudancas: [
      'Os dados reais das cinco filiais entraram no sistema: 1.596 ativos e 3.231 movimentações, conferidos contra a planilha.',
      'A partir desta data as planilhas antigas viraram consulta, e todo registro novo passou a ser feito aqui.',
    ],
  },
  {
    versao: '0.6.0',
    data: '2026-07-14',
    fase: 'F5A',
    titulo: 'O sistema passa a gerar os termos',
    mudancas: [
      'Os sete modelos de termo (cinco de responsabilidade e dois de devolução) passaram a ser gerados pelo sistema.',
      'O arquivo sai fiel ao modelo antigo, com prévia na tela antes de baixar.',
    ],
  },
  {
    versao: '0.5.0',
    data: '2026-07-14',
    fase: 'F3B',
    titulo: 'Relatório no formato do e-mail e itens por quantidade',
    mudancas: [
      'O relatório ganhou o formato do e-mail semanal, com os três grupos e as tabelas de saídas, entradas e transferências.',
      'Nasceu a tela de Itens, com saldo, o que está atrelado a cada equipamento e o que está faltando.',
      'A linha do tempo do ativo passou a aceitar anotações.',
    ],
  },
  {
    versao: '0.4.0',
    data: '2026-07-13',
    fase: 'F3',
    titulo: 'Relatórios por filial, acesso por senha e administração',
    mudancas: [
      'Nasceu o relatório ao vivo por filial e o consolidado, com indicadores, gráficos e resumo no formato do e-mail.',
      'Nasceu o relatório congelado da semana, guardado com versão própria.',
      'Quem só precisa ver o relatório passou a entrar por senha, sem conta no sistema.',
      'Administração ganhou convites, senhas de acesso, filiais e motivos, mais exportação e impressão.',
    ],
  },
  {
    versao: '0.3.0',
    data: '2026-07-13',
    fase: 'F2',
    titulo: 'A operação: lista, ficha, movimentação em lote e estorno',
    mudancas: [
      'Nasceu a lista de Ativos com busca e filtros, e a ficha com a linha do tempo do equipamento.',
      'Nasceu a nova movimentação, já em lote, com as regras de situação validadas na hora.',
      'Dá para estornar a última movimentação e cadastrar equipamento novo pela compra, inclusive em série.',
      'Primeiros atalhos contra a planilha: tecla N, repetir a última e duplicar da linha do tempo.',
    ],
  },
  {
    versao: '0.2.0',
    data: '2026-07-10',
    fase: 'F1',
    titulo: 'O banco de dados do sistema, com dados fictícios',
    mudancas: [
      'A estrutura de dados do sistema foi criada, com as regras de situação do equipamento junto dela.',
      'O ambiente de desenvolvimento passou a rodar com dados 100% fictícios, sem nenhum dado real da WAP.',
    ],
  },
  {
    versao: '0.1.0',
    data: '2026-07-10',
    fase: 'F0',
    titulo: 'Fundação: o sistema no ar, com login por convite',
    mudancas: [
      'O sistema nasceu e foi publicado, com o login por convite restrito ao e-mail corporativo.',
      'Ficaram de pé as telas iniciais e a sessão de quem entra.',
    ],
  },
]

/** A versao no ar. E sempre a primeira do registry — ha teste que trava isso. */
export function versaoAtual(): EntradaVersao {
  return VERSOES[0]
}

/** `1.40.0` -> `[1, 40, 0]`. Base do comparador (semver nao se compara como texto). */
export function partesSemver(versao: string): [number, number, number] {
  const [maior = 0, menor = 0, correcao = 0] = versao.split('.').map(Number)
  return [maior, menor, correcao]
}

/** Negativo se `a` vem antes de `b`; zero se iguais; positivo se depois. */
export function compararSemver(a: string, b: string): number {
  const pa = partesSemver(a)
  const pb = partesSemver(b)
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}
