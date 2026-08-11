import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import { TAMANHO_MAX_ROTULO } from '@/lib/import/limites'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// As mensagens desta pagina sao o TEXTO EXATO que o operador ve na tela. Os
// numeros dentro delas vem das constantes reais (regra de ouro): se um teto
// mudar no codigo, a mensagem documentada muda no mesmo build.
const COLUNAS = ['A mensagem', 'O que aconteceu', 'O que fazer']

export const mensagensDeErro: PaginaAjuda = {
  slug: 'mensagens-de-erro',
  titulo: 'Mensagens de erro',
  resumo: 'O que o sistema diz, o que significa e como sair.',
  categoria: 'consultar',
  termos: [
    'erro',
    'mensagem',
    'nao deixou',
    'bloqueado',
    'recusou',
    'invalido',
    'aviso',
    'vermelho',
    'nao consegui',
  ],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Quando o sistema recusa alguma coisa, ele explica em português o motivo. Esta é a tradução de cada recusa para "o que fazer agora".',
    },
    {
      tipo: 'nota',
      texto:
        'Regra geral: recusa é BLOQUEIO, não é perda. Quando o sistema recusa uma gravação, nada foi gravado — o formulário continua preenchido e o lote continua montado. As mensagens que começam com "Não foi possível…" e terminam com "Verifique sua conexão e tente de novo." dizem, de propósito, o que NÃO aconteceu ("nada foi estornado", "nenhum lançamento foi registrado", "a senha continua ativa"): pode repetir a ação sem medo de duplicar.',
    },
    { tipo: 'titulo', id: 'erros-formulario', texto: 'O que o formulário cobra antes de enviar' },
    {
      tipo: 'paragrafo',
      texto:
        'Estas aparecem em vermelho ao lado do campo, ou na caixa "Revise antes de continuar:" no topo do fluxo de movimentação. Nada foi enviado ainda.',
    },
    {
      tipo: 'tabela',
      colunas: COLUNAS,
      linhas: [
        [
          'Informe o motivo',
          'O tipo escolhido exige motivo e o campo "Motivo *" ficou vazio.',
          'Escolha um motivo na lista. Se o que você precisa não está lá, cadastre-o em Administração › Motivos, marcando o tipo em "Aplica-se a".',
        ],
        [
          'Informe o chamado do fornecedor',
          'Todo envio à manutenção exige o número do chamado aberto pelo fornecedor.',
          'Preencha "Chamado do fornecedor *". Se o fornecedor não deu número, escreva a referência que ele usa (ordem de serviço, protocolo, nome do contato) — o campo é texto livre e serve para você achar o caso depois.',
        ],
        [
          'Escolha o novo status do ativo',
          'O ajuste chegou sem o estado de destino.',
          'Preencha "Novo status *" com o estado real do equipamento.',
        ],
        [
          'A justificativa do ajuste precisa de ao menos 10 caracteres',
          'O ajuste é a válvula de escape e sempre fica registrado — por isso cobra uma explicação de verdade.',
          'Escreva em "Observação * (justificativa)" o que aconteceu na vida real ("aparelho voltou direto do fornecedor para a mesa do Fulano").',
        ],
        [
          'Informe o colaborador ou o setor de destino',
          // Revisão do intervalo F32→F34 (11/08/2026): o parêntese antigo dizia
          // que "a reserva não exige nenhum dos dois — nela só a Data é
          // obrigatória", e isso deixou de valer. A F34 abriu a re-reserva
          // (reserva sobre um ativo já reservado) e uma reserva em branco por
          // cima de outra apagava o detentor anterior em silêncio; a reserva
          // ganhou a MESMA regra cruzada de saída/empréstimo.
          'Saída, empréstimo e reserva precisam de um destino: uma pessoa ou um setor. Na reserva isso é o que impede uma reserva nova por cima de outra de apagar, sem aviso, para quem o equipamento estava separado.',
          'Preencha "Colaborador" ou "Setor" — um dos dois basta.',
        ],
        [
          'O chamado deve conter apenas números',
          'O campo "Chamado" guarda o número do chamado interno, só dígitos.',
          'Tire letras, traços e o "#". O chamado do FORNECEDOR é outro campo e aceita texto.',
        ],
        [
          `O lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO} itens`,
          `O lote de movimentação passou de ${MAX_LOTE_MOVIMENTACAO} ativos.`,
          'Registre este lote e comece outro com o resto — o sistema já avisa quantos ficaram de fora.',
        ],
        [
          `O lançamento aceita no máximo ${MAX_LINHAS_LOTE_ITEM} itens`,
          `O carrinho de lançamento de itens passou de ${MAX_LINHAS_LOTE_ITEM} linhas.`,
          'Lance em duas partes. O contador ao lado de "Itens" mostra quanto já foi usado.',
        ],
        [
          `A faixa tem N itens; o máximo por lote é ${MAX_LOTE_COMPRA}.`,
          `A faixa de patrimônios do cadastro de compra passou de ${MAX_LOTE_COMPRA} unidades.`,
          'Quebre a faixa em duas compras.',
        ],
        [
          'Patrimônio fora do formato canônico',
          'O patrimônio digitado não tem a forma prefixo + 7 dígitos (por exemplo WAP0001234).',
          'Corrija a linha apontada no preview. Quem tem plaqueta fora do padrão veio do import de startup e não se cadastra por aqui.',
        ],
        [
          'Informe a service tag',
          'No cadastro manual a service tag é obrigatória em todas as categorias.',
          'Transcreva a etiqueta do equipamento. Ela é a identidade que não muda — só o import aceita ativo sem ela, e nesse caso nasce uma pendência.',
        ],
      ],
    },
    { tipo: 'titulo', id: 'erros-movimentacoes', texto: 'Movimentações, estornos e termos' },
    {
      tipo: 'tabela',
      colunas: COLUNAS,
      linhas: [
        [
          'Transição inválida: o ativo não aceita essa movimentação no estado atual.',
          'O tipo escolhido não vale para o estado em que o ativo está AGORA. Costuma acontecer quando alguém movimentou o equipamento enquanto você montava o lote.',
          'Abra a ficha e confira o status atual. Se a realidade fugiu do fluxo (o equipamento está numa situação que nenhum tipo descreve), use "Ajuste" com o novo status e a justificativa.',
        ],
        [
          'Só a última movimentação do ativo pode ser estornada (para casos antigos, use um ajuste com justificativa).',
          'O estorno desfaz só o evento mais recente do ativo; você pediu para desfazer um anterior.',
          'Estorne primeiro as movimentações mais novas — ou, se elas estiverem certas, registre um "Ajuste" levando o ativo ao estado correto, com a justificativa.',
        ],
        [
          'Esta movimentação não pode ser estornada.',
          'A linha escolhida já é um estorno, ou já foi estornada antes.',
          'Confira a linha do tempo: o par "(estorno)" e "(estornada)" já está registrado. Para corrigir de novo, o caminho é o ajuste.',
        ],
        [
          'O ajuste exige o status resultante e uma justificativa (observação).',
          'O ajuste chegou ao banco sem o estado de destino ou sem observação.',
          'Volte ao passo 2 e preencha "Novo status *" e "Observação * (justificativa)".',
        ],
        [
          'A filial de destino deve ser diferente da atual.',
          'A transferência apontou para a filial em que o ativo já está.',
          'Escolha outra filial em "Filial de destino *" — ou cancele: não há transferência a registrar.',
        ],
        [
          'O lote não pode repetir o mesmo ativo. Registre em lotes separados.',
          'O mesmo equipamento entrou duas vezes no lote.',
          'Remova a linha repetida no passo 1. Para registrar dois eventos do mesmo ativo, faça um lote de cada vez.',
        ],
        [
          'Não processado — o lote foi interrompido em um item anterior.',
          'Outra linha do lote falhou e as seguintes nem chegaram a ser tentadas.',
          'Corrija a linha que falhou (a mensagem dela aparece no próprio item, em "Itens que falharam no último envio:") e registre de novo. O que já entrou aparece em "Já registrados" e não é duplicado.',
        ],
        [
          'Este termo já consta como assinado.',
          'A assinatura desse termo já tinha sido confirmada — por você ou por outro operador.',
          'Atualize a página: a ficha já mostra "Termo assinado" e a data. Se a confirmação foi engano, use "Desfazer".',
        ],
        [
          'Só é possível desfazer um termo confirmado como assinado.',
          'Você pediu para desfazer a confirmação de um termo que ainda não está como assinado.',
          'Não há o que desfazer — o termo continua pendente. Atualize a página para ver o estado real.',
        ],
      ],
    },
    { tipo: 'titulo', id: 'erros-itens', texto: 'Itens por quantidade' },
    {
      tipo: 'tabela',
      colunas: COLUNAS,
      linhas: [
        [
          'Estoque insuficiente: a operação deixaria o item com estoque negativo na prateleira.',
          'A quantidade que você quer tirar é maior do que a que existe naquela filial.',
          'Confira a coluna "Estoque" da filial escolhida. Se a prateleira tem mais do que o sistema sabe, registre antes a "Entrada" que faltou — ou um "Ajuste" com justificativa.',
        ],
        [
          'Ajuste inválido: deixaria o item com total negativo.',
          'O ajuste negativo é maior que o Total que a TI possui daquele item.',
          'Reveja a quantidade: o ajuste corrige a contagem, não cria dívida. Se o total está errado desde antes, ajuste em duas etapas e explique em cada uma.',
        ],
        [
          'A devolução é maior que a quantidade atrelada ao chamado.',
          'Você está devolvendo mais peças do que as que foram atreladas naquele chamado.',
          'Confira o número do chamado e o histórico daquele item. Devolva o que está atrelado; o excedente, se existir de verdade, entra como "Entrada".',
        ],
        [
          'O retorno é maior que a quantidade liberada em aberto.',
          'O retorno passou do que ainda está com as pessoas por aquela liberação.',
          'Veja no histórico quanto ainda está em aberto e lance só essa quantidade.',
        ],
        [
          'O ajuste exige uma justificativa (observação).',
          'Todo ajuste de item fica registrado com o motivo — e ele chegou vazio.',
          'Preencha "Observação (justificativa do ajuste)". Bastam algumas palavras, mas elas ficam no histórico.',
        ],
        [
          'Reserva e liberação exigem o número do chamado.',
          'Na tela esses dois tipos se chamam "Atrelar" e "Devolução": são os que amarram a peça a um chamado, e por isso pedem o número.',
          'Preencha "Chamado" (só números). Sem chamado, o par ida/volta não fecha e a coluna "Falta" acende depois.',
        ],
        [
          'Quantidade inválida para este tipo de lançamento.',
          'Todos os tipos exigem quantidade maior que zero; só o "Ajuste" aceita número negativo — e nunca zero.',
          'Corrija a quantidade da linha. No ajuste, negativo significa baixa.',
        ],
        [
          'Já existe um item com esse nome.',
          'O catálogo não aceita dois itens com o mesmo nome.',
          'Use o item que já existe. Se ele não aparece na busca, provavelmente está desativado: reative-o em Administração › Itens.',
        ],
        [
          'Este lançamento já foi estornado.',
          'Alguém (ou você, em outra aba) já criou o estorno desse lançamento.',
          'Atualize a página: o histórico já mostra "(estornado)" na linha original e a linha inversa logo acima.',
        ],
        [
          'Um estorno não pode ser estornado.',
          'Você pediu o estorno de uma linha que já é o inverso de outra.',
          'Para desfazer um estorno, registre o lançamento correspondente de novo, pelo botão "Lançar".',
        ],
        [
          'Não é possível excluir: há N lançamento(s) para este item. Desative-o em vez de excluir.',
          'Item com histórico não se apaga — isso reescreveria o passado.',
          'Desmarque "Item ativo" na janela de edição. Ele some das listas de lançamento e continua no histórico.',
        ],
      ],
    },
    { tipo: 'titulo', id: 'erros-cadastro', texto: 'Cadastro, identidade e duplicidade' },
    {
      tipo: 'tabela',
      colunas: COLUNAS,
      linhas: [
        [
          'Já existe um ativo com esse patrimônio e service tag nesta filial.',
          'A identidade do equipamento é o PAR patrimônio + service tag, e esse par já está cadastrado nesta filial. Patrimônio repetido sozinho é permitido; o par, não. Em OUTRA filial o mesmo par pode existir — quando isso acontece, os dois cadastros aparecem juntos na aba "Conflitos entre filiais" de Pendências.',
          'Procure o equipamento pela service tag na busca global (Ctrl+K). Se for outra máquina, confira a etiqueta: quase sempre a service tag foi digitada com o valor da anterior.',
        ],
        [
          'Este ativo já tem service tag — ela é imutável (identidade do equipamento).',
          'Service tag preenchida não se troca: ela é o que identifica a máquina quando o patrimônio muda.',
          'Se a tag registrada está errada, o caminho é registrar a diferença numa anotação da ficha e tratar o caso com o administrador do sistema. O patrimônio, esse sim, se corrige pelo menu ⋯ da ficha.',
        ],
        [
          'Já existe um registro com esses dados. Atualize a página e tente de novo.',
          'Outra pessoa (ou outra aba sua) gravou o mesmo registro primeiro.',
          'Atualize a página e confira: o que você ia criar provavelmente já está lá.',
        ],
        [
          'Um dos valores informados (motivo ou filial) não existe mais.',
          'O motivo ou a filial que estavam na sua tela foram apagados ou desativados enquanto você preenchia.',
          'Atualize a página e escolha de novo nas listas.',
        ],
        [
          'Já existe uma filial com esse slug.',
          'O slug entra no endereço do relatório e não pode repetir.',
          'Escolha outro slug (por exemplo, acrescente a cidade).',
        ],
        [
          'Já existe um motivo com esse código.',
          'O código do motivo é único e fixo depois de criado.',
          'Reaproveite o motivo existente — se ele estiver inativo, marque "Motivo ativo" de volta.',
        ],
        [
          'Já existe um kit com esse nome.',
          'Nome de kit não repete, nem contra um kit desativado.',
          'Edite o kit que já existe ou escolha outro nome.',
        ],
        [
          'Não é possível desativar: há N ativo(s) nesta filial. Transfira-os antes.',
          'Filial com acervo não é desativada — os equipamentos ficariam órfãos.',
          'Transfira os ativos para outra filial (movimentação "Transferência") e só então desative.',
        ],
        [
          'Não é possível desativar: há N item(ns) com saldo nesta filial (U unidade(s) em estoque). Zere o estoque antes, em Itens por quantidade.',
          'A filial ainda tem peças na prateleira.',
          'Zere o saldo daquela filial na página Itens por quantidade, pelos lançamentos que couberem ao caso, e repita a desativação.',
        ],
      ],
    },
    { tipo: 'titulo', id: 'erros-import', texto: 'Import de startup' },
    {
      tipo: 'tabela',
      colunas: COLUNAS,
      linhas: [
        [
          'O arquivo precisa ter extensão .csv ou .xlsx.',
          'O import lê só esses dois formatos.',
          'Salve a planilha como .xlsx (recomendado — preserva datas e acentos) ou como CSV, e envie de novo.',
        ],
        [
          `O arquivo tem X MB — o limite é ${TAMANHO_MAX_ROTULO}.`,
          `Arquivo acima de ${TAMANHO_MAX_ROTULO}: quase sempre é o arquivo errado, não um inventário grande.`,
          'Confira se enviou a planilha do inventário daquela filial, e não um export completo do sistema antigo.',
        ],
        [
          'O arquivo está vazio.',
          'O arquivo tem zero bytes — costuma ser download interrompido.',
          'Baixe ou exporte a planilha de novo e reenvie.',
        ],
        [
          'Não foi possível ler o arquivo. Confira o CSV/Excel e tente de novo.',
          'O conteúdo não tem a forma de uma planilha de inventário (cabeçalho ausente, arquivo corrompido, formato trocado).',
          'Abra o arquivo, confirme que a primeira linha é o cabeçalho e salve de novo. O .xlsx erra menos que o CSV.',
        ],
        [
          'Filial inativa: import bloqueado.',
          'A filial escolhida está desativada.',
          'Reative a filial em Administração › Filiais e recomece o import.',
        ],
        [
          'Confirmação incorreta: digite exatamente "{nome da filial}" para prosseguir.',
          'O campo de confirmação do último passo não bateu com o nome da filial.',
          'Digite o nome como ele aparece na tela, com acentos e maiúsculas. É a trava proposital de uma ação irreversível.',
        ],
        [
          'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.',
          'Alguém movimentou, cadastrou ou apagou algo naquela filial entre a análise e a confirmação. Nada foi alterado.',
          'Clique em "Analisar arquivo" de novo com o mesmo arquivo, confira os números do preview e reaplique.',
        ],
        [
          'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.',
          'Existe termo gerado que cobre ativos desta filial e de outra ao mesmo tempo — apagar o acervo desta deixaria o documento pela metade.',
          'A lista "Termos multi-filial" no preview mostra quais são. Trate esses termos antes de substituir.',
        ],
        [
          'Já existe um ativo sem patrimônio com essa service tag nesta filial — a service tag é a identidade quando não há patrimônio.',
          'Sem plaqueta, é a service tag que identifica a máquina — e ela já está em uso por outro cadastro desta filial.',
          'Ache as duas linhas na planilha, corrija a que está errada (ou preencha o patrimônio de uma delas) e reanalise.',
        ],
        [
          'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.',
          'Duas linhas do arquivo descrevem o mesmo equipamento.',
          'Apague a linha duplicada na planilha — ou remova-a na própria tela do preview — e reanalise.',
        ],
        [
          'A importação demorou demais e foi cancelada — tente novamente ou avise o TI.',
          'A substituição passou do tempo máximo e foi cancelada pelo banco. Como tudo é feito de uma vez só, NADA foi alterado.',
          'Tente de novo, de preferência fora do horário de pico. Se repetir, avise o TI antes de insistir.',
        ],
        [
          'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.',
          'Depois de gravar, o sistema reconta o que criou e o que apagou; os números não fecharam e ele desfez tudo sozinho.',
          'Reanalise o arquivo e aplique de novo. Se acontecer duas vezes com o mesmo arquivo, pare e avise o TI — não force.',
        ],
        [
          'Falha ao gerar o backup do acervo. Import cancelado.',
          'O backup do que seria apagado não pôde ser gravado — e sem backup a substituição não roda.',
          'Tente de novo. Nada foi apagado: a regra é backup primeiro, substituição depois.',
        ],
      ],
    },
    { tipo: 'titulo', id: 'erros-sessao', texto: 'Sessão, cargo e acesso' },
    {
      tipo: 'nota',
      texto: `Recusa de CARGO não se resolve entrando de novo. As cinco primeiras mensagens da tabela abaixo falam do que o seu cargo (ou a sua lista de filiais) permite: relogar não muda nada, quem muda é um ${PAPEL_ROTULO.admin} na tela de usuários. As de sessão, sim, se resolvem com um login novo. Em todos os casos nada foi gravado.`,
    },
    {
      tipo: 'tabela',
      colunas: COLUNAS,
      linhas: [
        [
          'Seu cargo é de consulta (somente leitura): você pode consultar tudo, mas não registrar alterações.',
          `Você tem o cargo ${PAPEL_ROTULO.consulta} e tentou gravar algo — normalmente por um endereço aberto direto, porque a tela não mostra o botão.`,
          `Continue consultando à vontade. Se registrar passou a ser sua função, peça a um ${PAPEL_ROTULO.admin} para mudar o seu cargo.`,
        ],
        [
          'Esta ação é restrita a administradores.',
          `A ação é da Administração (usuários, senhas de acesso, filiais, motivos, kits, catálogo de itens, import) e o seu cargo não a alcança — ela é dos cargos ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.dev}.`,
          `Peça a um ${PAPEL_ROTULO.admin}. Entrar de novo não muda o cargo.`,
        ],
        [
          'Esta ação é restrita ao cargo Desenvolvedor.',
          `A ação é privativa do cargo ${PAPEL_ROTULO.dev}: trocar o e-mail de uma conta, apagar uma conta, encerrar as sessões de alguém, mexer em quem tem esse cargo e a área técnica dele. Nem o cargo ${PAPEL_ROTULO.admin} a alcança.`,
          `Peça a um ${PAPEL_ROTULO.dev}. Entrar de novo não muda o cargo, e nada foi gravado.`,
        ],
        [
          'Você não tem permissão de escrita nesta filial. Fale com um administrador.',
          `Seu cargo é ${PAPEL_ROTULO.operador} e aquela filial não está na sua lista de filiais de escrita. Quando o sistema sabe o nome, ele o diz na mensagem ("na filial Matriz").`,
          `Registre na filial em que você atua, ou peça a um ${PAPEL_ROTULO.admin} para incluir a filial na sua lista.`,
        ],
        [
          'O lote inclui filial em que você não tem permissão de escrita. Fale com um administrador.',
          'O lote juntou equipamentos de filiais diferentes e você não escreve em uma delas. O lote é recusado INTEIRO, nunca pela metade.',
          'Tire do lote o que não é da sua filial e registre o resto; o que sobrou vai para quem opera a outra filial.',
        ],
        [
          'Sem permissão para esta operação: seu cargo ou suas filiais de escrita não permitem. Se seu acesso mudou agora, recarregue a página; se não, fale com um administrador.',
          'O próprio banco recusou a gravação por cargo ou filial — é a segunda linha de defesa, que aparece quando a tela ainda mostrava um botão que o seu acesso já não permite (por exemplo, o cargo mudou enquanto você estava com a tela aberta).',
          'Recarregue a página: a tela volta com o que o seu acesso atual permite. Se o botão continuar lá e a recusa se repetir, avise o TI.',
        ],
        [
          'Seu acesso foi desativado. Fale com um administrador.',
          'A conta foi desativada na tela de usuários. Nada é gravado, e no carregamento seguinte de tela você cai no login.',
          'Se foi engano, um administrador reativa a conta e o acesso volta no carregamento seguinte — o cargo e as filiais continuam os mesmos.',
        ],
        [
          'Não foi possível conferir seu acesso agora. Tente de novo em instantes.',
          'O sistema não conseguiu LER do banco qual é o seu cargo ou em que filiais você escreve — não é o mesmo que o seu acesso ter mudado. Costuma ser oscilação de rede ou um instante de lentidão do banco. Nada foi gravado.',
          'Tente de novo em alguns segundos. Se a mensagem insistir, avise o TI: é sinal de indisponibilidade, não de permissão — não adianta relogar nem procurar um administrador.',
        ],
        [
          'Sua sessão expirou. Faça login novamente.',
          'A sessão do operador vale 24 horas contadas do login.',
          'Refaça o login. Nada do que já estava registrado se perde.',
        ],
        [
          'Sua sessão expirou, entre novamente.',
          'Mesma coisa, quando a expiração é percebida ao abrir uma tela: o sistema devolve você ao login com este aviso.',
          'Entre de novo e siga de onde parou.',
        ],
        [
          'E-mail ou senha inválidos',
          'A combinação não confere. A mensagem fica escrita embaixo do formulário, além do aviso passageiro.',
          'Confira o e-mail (tem de ser um dos domínios corporativos) e a senha. Sem a senha, peça a um administrador um novo link de acesso.',
        ],
        [
          'Senha inválida.',
          'A senha de acesso aos relatórios não confere — ou foi revogada.',
          'Peça a senha atual a quem administra. Senha revogada deixa de valer no carregamento seguinte.',
        ],
        [
          'Muitas tentativas. Aguarde um instante e tente de novo.',
          'Proteção contra tentativa em série na entrada por senha dos relatórios.',
          'Espere um pouco e tente outra vez, com a senha correta em mãos.',
        ],
        [
          'Seu link expirou. Peça um novo convite ao administrador.',
          'O link de convite/acesso vale por tempo limitado e já passou do prazo.',
          'Peça outro link em Administração › Usuários: gerar um novo não apaga nada do que a pessoa já fez.',
        ],
        [
          'Não foi possível confirmar o link. Peça um novo convite ou link de acesso.',
          'O link foi aberto mas não pôde ser validado — normalmente por já ter sido usado.',
          'Peça um link novo. Uma prévia do link no WhatsApp ou no Teams não o consome: só o clique em ativar.',
        ],
        [
          `Só e-mails ${DOMINIOS_TEXTO} podem ser convidados.`,
          'O convite aceita apenas os domínios corporativos.',
          'Use o e-mail corporativo da pessoa. Não há convite para e-mail pessoal.',
        ],
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Quando aparece a mensagem genérica "Não foi possível concluir a operação. Tente novamente." é porque o sistema recusou por um motivo que ele não sabe traduzir. Tente uma vez mais; se repetir, anote o que você estava fazendo (tela, ativo, tipo) e avise o TI — cada ocorrência fica registrada do lado do servidor e é por ela que o caso é investigado.',
    },
    {
      tipo: 'nota',
      texto:
        'A tela "Algo deu errado nesta tela" com os botões "Tentar de novo" e "Ir para o início" não é uma recusa: é a rede de segurança quando uma leitura falha. Nada foi gravado nem apagado. "Tentar de novo" repete a mesma tela com os mesmos filtros — se ela falhar sempre, o problema pode estar no endereço, e a saída é limpar os filtros.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'problemas-comuns' },
        { slug: 'problemas-import-e-acesso' },
        { slug: 'tipos-de-movimentacao', texto: 'Que campos cada tipo exige' },
        { slug: 'limites-e-atalhos', texto: 'Os tetos de cada lote' },
        { slug: 'acesso-e-sessoes', ancora: 'acesso-cargos', texto: 'O que cada cargo pode registrar' },
      ],
    },
  ],
}
