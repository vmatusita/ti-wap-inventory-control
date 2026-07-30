import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import { ACOES_ADMIN, ACAO_ROTULO } from '@/lib/auditoria'
import { MSG_SO_DEV_APAGA, MSG_SO_DEV_GERE_DEV } from '@/lib/validators/admin'
import { verbetesCargo } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// A lista do que a aba de Auditoria registra NAO e digitada: vem do vocabulario
// fechado de `src/lib/auditoria.ts`, o mesmo que rotula cada linha da trilha na
// tela. Acao nova entra na documentacao no mesmo build (em minuscula porque aqui
// ela aparece no meio de uma frase, e nao como rotulo de coluna).
const ACOES_AUDITADAS = ACOES_ADMIN.map((a) => ACAO_ROTULO[a].toLowerCase()).join(', ')

// REGRA DE OURO: a lista de dominios corporativos NUNCA e digitada aqui — vem de
// `DOMINIOS_TEXTO`, o mesmo texto que o dialogo de convite mostra e que a mensagem
// de erro repete. Dominio novo entra na lista uma vez e a documentacao acompanha no
// mesmo build. O mesmo vale para os nomes dos CARGOS (`PAPEL_ROTULO` e a descricao
// de cada um, via `verbetesCargo`).

export const usuariosESenhas: PaginaAjuda = {
  slug: 'usuarios-e-senhas',
  titulo: 'Operadores e senhas de acesso',
  resumo: 'Convidar quem opera, definir cargo e filiais, e entregar (ou revogar) o acesso aos relatórios.',
  categoria: 'fazer',
  termos: [
    'convite',
    'convidar',
    'usuario',
    'operador',
    'senha de acesso',
    'revogar',
    'reativar',
    'visualizador',
    'compartilhar',
    'primeiro acesso',
    'nome',
    'sobrenome',
    'usuarios',
    'cargo',
    'cargos',
    'promover',
    'rebaixar',
    'desativar usuario',
    'desligar',
    'filiais de escrita',
    'auditoria',
    'desenvolvedor',
    'apagar conta',
    'excluir usuario',
    'trocar e-mail',
    'encerrar sessoes',
  ],
  legado: ['admin', 'acesso'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `Há duas coisas diferentes aqui. Convidar uma PESSOA dá a ela uma conta no sistema, e só vale para e-mails ${DOMINIOS_TEXTO} — no convite você escolhe o CARGO dela e, se for ${PAPEL_ROTULO.operador}, em quais filiais ela pode registrar. Criar uma SENHA DE ACESSO dá a alguém de fora da TI a possibilidade de abrir os relatórios, e nada mais.`,
    },
    {
      tipo: 'nota',
      texto: `Use o convite quando a pessoa é da equipe e vai USAR o sistema — registrando (cargos ${PAPEL_ROTULO.dev}, ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.operador}) ou apenas consultando por dentro dele (cargo ${PAPEL_ROTULO.consulta}). Use a senha de acesso para quem é de fora da TI e só precisa acompanhar os números: ela abre os relatórios sem criar conta e é revogável uma a uma. Convidar não é mais "dar acesso a tudo": o cargo é que diz o que a pessoa faz, e você pode mudá-lo depois.`,
    },
    {
      tipo: 'lista',
      itens: [
        'Antes de convidar: tenha o e-mail corporativo da pessoa, decida o cargo dela (e as filiais, no caso do operador) e tenha um canal para entregar o link (WhatsApp, Teams, e-mail) — o sistema não envia nada sozinho.',
        'Antes de criar uma senha de acesso: saiba para quem ela vai, porque o rótulo da senha é o que identifica quem a usa na hora de revogar.',
      ],
    },

    { tipo: 'titulo', id: 'usuarios-cargos', texto: 'Escolher o cargo' },
    {
      tipo: 'paragrafo',
      texto:
        'Os quatro cargos leem o sistema inteiro — as cinco filiais, as listas, as fichas, os saldos, os relatórios e esta documentação. A diferença está em registrar:',
    },
    { tipo: 'glossario', badge: 'neutro', itens: verbetesCargo() },
    {
      tipo: 'lista',
      itens: [
        `Na dúvida entre ${PAPEL_ROTULO.operador} e ${PAPEL_ROTULO.admin}, escolha ${PAPEL_ROTULO.operador}: é o cargo de quem trabalha no estoque todo dia. ${PAPEL_ROTULO.admin} é para quem também cuida do cadastro de apoio, das contas e do import — e o sistema funciona bem com poucos.`,
        `${PAPEL_ROTULO.consulta} é para quem acompanha por dentro do sistema sem mexer em nada: gestor da área, alguém em treinamento, auditoria interna. Ele não vê botão de registrar em tela nenhuma.`,
        `${PAPEL_ROTULO.operador} precisa de ao menos uma filial de escrita — a tela não deixa salvar sem nenhuma. Marque as filiais em que a pessoa realmente atua; nas outras ela continua vendo tudo, mas não registra.`,
        `${PAPEL_ROTULO.dev} é o cargo de quem cuida do sistema por dentro: no estoque ele faz tudo o que um ${PAPEL_ROTULO.admin} faz e, além disso, troca o e-mail de uma conta, apaga uma conta e encerra as sessões de alguém. Só um ${PAPEL_ROTULO.dev} concede esse cargo, e quem tem outro cargo não edita, não desativa e não apaga quem já o tem — na tabela de usuários a linha dessa pessoa aparece com as ações desligadas.`,
        `${PAPEL_ROTULO.dev}, ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.consulta} não usam a lista de filiais: os dois primeiros escrevem em todas, o último em nenhuma.`,
        'Cargo errado não é problema permanente: mudar leva um clique na tabela de usuários e vale no carregamento seguinte de tela da pessoa.',
      ],
    },

    { tipo: 'titulo', id: 'usuarios-convidar', texto: 'Convidar uma pessoa' },
    {
      tipo: 'passos',
      titulo: 'Convidar uma pessoa para o sistema',
      itens: [
        'Vá a Administração › Usuários. A tabela lista quem tem conta, com o nome, o e-mail, o cargo, as filiais de escrita e a situação (ativo ou desativado).',
        'Use "Convidar usuário". O diálogo se chama "Convidar operador" e avisa o que vai acontecer: gera um link de convite para você enviar à pessoa (sem e-mail automático), e o cargo escolhido ali vale a partir do primeiro acesso dela.',
        `Digite o "E-mail" da pessoa. Só e-mails ${DOMINIOS_TEXTO} são aceitos: fora desses domínios o botão fica desligado e aparece a mensagem "O e-mail precisa terminar com ${DOMINIOS_TEXTO}." — não há como convidar um e-mail pessoal.`,
        `Escolha o "Cargo". Ao escolher ${PAPEL_ROTULO.operador}, aparece a lista "Filiais de escrita": marque as filiais em que a pessoa vai registrar. Sem nenhuma marcada o convite não é aceito, e a tela diz isso antes de você tentar.`,
        'Use "Gerar link" (o Enter no campo faz o mesmo). A tela troca para "Convite gerado — copie o link", com o endereço numa caixa e o botão "Copiar" ao lado (ele vira "Copiar" → "Copiado" quando dá certo).',
        'Cole o link no WhatsApp, no Teams ou no e-mail e mande para a pessoa. Depois use "Concluir" para fechar.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'O que acontece por trás: NENHUM e-mail é enviado pelo sistema — o link nasce na própria tela e a entrega é sua. Ele vale por tempo limitado; se expirar, é só gerar outro pelo mesmo caminho, quantas vezes precisar. Só o clique em ativar consome o link, então a prévia que o WhatsApp ou o Teams geram ao colar o endereço NÃO o invalida. A pessoa entra na tabela de Usuários assim que o link é gerado, já com o cargo e as filiais que você escolheu. Enquanto ela não ativar o acesso, a coluna "Nome" mostra o e-mail dela; é o primeiro acesso que troca isso pelo nome e sobrenome que ela informar.',
    },

    {
      tipo: 'titulo',
      id: 'usuarios-ativar',
      texto: 'O primeiro acesso de quem foi convidado',
    },
    {
      tipo: 'passos',
      titulo: 'Ativar o acesso e definir a senha',
      itens: [
        'A pessoa abre o link que você mandou. A tela mostra a marca, a frase de boas-vindas e um botão só: "Ativar meu acesso".',
        'Ao clicar, ela cai na tela "Complete seu cadastro de acesso", com quatro campos: "Nome", "Sobrenome", "Nova senha" (mínimo 8 caracteres) e "Confirmar senha".',
        'Nome e sobrenome são DOIS campos separados e são informados pela própria pessoa — quem convida digita só o e-mail. Abaixo do sobrenome a tela avisa: é esse nome que aparece nos registros e nos termos que ela gerar.',
        'O cargo e as filiais NÃO são escolhidos aqui: eles vêm do convite. Ninguém define o próprio cargo.',
        'Com "Concluir cadastro" a conta fica pronta e a pessoa já entra no sistema. Desse ponto em diante ela entra por /login com o e-mail e a senha que escolheu.',
        'Se o link já tiver sido usado ou tiver expirado, a tela diz que não foi possível ativar o acesso e oferece "Ir para o login" — gere outro convite para a mesma pessoa, pelo mesmo caminho.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'O nome e o sobrenome informados passam a identificar a pessoa em tudo que ela fizer: autor da movimentação na linha do tempo, autor da anotação, quem gerou o termo, quem rodou o import, o nome no cabeçalho do sistema e a coluna "Nome" de Administração › Usuários.',
    },

    {
      tipo: 'titulo',
      id: 'usuarios-editar',
      texto: 'Mudar o cargo ou as filiais de alguém',
    },
    {
      tipo: 'passos',
      titulo: 'Mudar o cargo ou as filiais de escrita',
      itens: [
        'Em Administração › Usuários, use "Editar" na linha da pessoa. O diálogo se chama "Cargo e filiais de escrita" e não mexe em nome nem em e-mail — esses são dela.',
        `Escolha o "Cargo". Com ${PAPEL_ROTULO.operador} aparece a lista "Filiais de escrita", e ao menos uma tem de estar marcada. ${PAPEL_ROTULO.dev}, ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.consulta} dispensam a lista — os dois primeiros passam a escrever em todas as filiais, o último em nenhuma.`,
        `O cargo ${PAPEL_ROTULO.dev} não aparece na lista para quem não o tem, e a linha de quem já o tem vem com as ações desligadas: mexer em ${PAPEL_ROTULO.dev} é só de ${PAPEL_ROTULO.dev}. A recusa não é só da tela — abrir o endereço na mão também não passa.`,
        'A mudança vale no próximo carregamento de tela da pessoa: os botões que o cargo novo não permite desaparecem, e os que ele passa a permitir aparecem. Ninguém precisa sair e entrar de novo.',
        `Você não muda o SEU próprio cargo, e o sistema não deixa o último administrador ativo ser rebaixado — sem essa trava um clique errado trancaria a administração para todo mundo. Contam nessa conta os dois cargos que abrem a Administração (${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.dev}). Nos dois casos a tela recusa e explica o motivo.`,
        'Nada do que a pessoa já registrou muda de dono ou desaparece: o histórico é imutável, e o nome dela continua na linha do tempo do que fez.',
      ],
    },

    {
      tipo: 'titulo',
      id: 'usuarios-desativar',
      texto: 'Desativar e reativar quem saiu (ou voltou)',
    },
    {
      tipo: 'passos',
      titulo: 'Desativar o acesso de alguém que saiu',
      itens: [
        'Em Administração › Usuários, use "Desativar" na linha da pessoa. É o caminho para quem saiu da equipe, trocou de função ou está afastado — não apague a conta.',
        'Como a ação corta o acesso de alguém, ela pede confirmação: o diálogo "Desativar o acesso de" nomeia a pessoa e explica o efeito. O foco começa em "Cancelar", então um Enter distraído não desativa ninguém.',
        'O efeito é imediato: no próximo carregamento de tela ela cai no login, mesmo que estivesse com o sistema aberto, e uma tentativa de gravar antes disso é recusada com "Seu acesso foi desativado. Fale com um administrador.". O login também deixa de aceitar a senha dela.',
        'A linha continua na tabela, com a situação "Desativado" — é assim que se sabe que aquela conta existiu e quem ela foi na linha do tempo dos registros antigos. Desativar não apaga nada do histórico dela.',
        '"Reativar" é o mesmo caminho, na direção contrária, e é um clique só: o acesso volta no carregamento seguinte, com o cargo e as filiais que estavam gravados.',
        'Você não desativa a si mesmo (o botão fica desligado na sua própria linha), e o último administrador ativo não pode ser desativado. A tela recusa e diz por quê.',
      ],
    },

    {
      tipo: 'titulo',
      id: 'usuarios-dev',
      texto: `As três ações que só o cargo ${PAPEL_ROTULO.dev} tem`,
    },
    {
      tipo: 'paragrafo',
      texto: `Na linha de cada pessoa, quem tem o cargo ${PAPEL_ROTULO.dev} vê um botão "⋯" além de "Editar" e "Desativar". Ele abre o grupo "Gestão avançada", com três ações que nenhum outro cargo enxerga: "Alterar e-mail de login…", "Encerrar sessões abertas…" e "Apagar conta…". Quem tem outro cargo não vê o botão, e abrir o endereço na mão também não passa — a resposta é "Esta ação é restrita ao cargo ${PAPEL_ROTULO.dev}." e nada é gravado.`,
    },
    {
      tipo: 'passos',
      titulo: 'Alterar o e-mail de login de uma conta',
      itens: [
        'É o caminho de quem mudou de endereço corporativo (troca de sobrenome, mudança de empresa dentro do grupo) — não serve para criar uma conta nova.',
        'Em "⋯" › "Alterar e-mail de login…", o diálogo "Alterar o e-mail de …" mostra o "E-mail de hoje" e pede o "Novo e-mail".',
        `O e-mail novo continua tendo de ser ${DOMINIOS_TEXTO}: fora disso a tela avisa "O e-mail precisa terminar com ${DOMINIOS_TEXTO}." e o botão não conclui. E-mail já usado por outra conta também é recusado, com o motivo escrito.`,
        'Confirme em "Alterar e-mail". A troca vale na hora: no próximo login a pessoa entra com o endereço novo, o antigo deixa de servir, ela não precisa confirmar nada por e-mail e a senha dela continua a mesma.',
        'Cargo, filiais de escrita, nome e todo o histórico ficam como estavam. A troca entra na aba "Auditoria", com o endereço antigo e o novo.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Apagar uma conta de vez',
      itens: [
        'Apagar não é desativar: é o caminho definitivo. A conta deixa de existir, a pessoa não entra mais e a linha some da tabela de usuários — não há "Reativar" depois.',
        'O HISTÓRICO DELA CONTINUA NO SISTEMA, com o nome dela. Movimentações, lançamentos de item, termos e anotações que ela registrou permanecem exatamente como estão, porque o registro do que aconteceu não se apaga.',
        'O e-mail dela fica livre: dá para convidar alguém com esse mesmo endereço outra vez, e será uma conta nova, do zero.',
        'Em "⋯" › "Apagar conta…", o diálogo "Apagar a conta de …?" repete esses três efeitos e pede a confirmação: "Para confirmar, digite o e-mail da conta". O endereço aparece logo acima do campo; enquanto o que você digitar não bater com ele, o botão "Apagar conta" continua desligado. O foco começa em "Cancelar".',
        'Você não apaga a sua própria conta (a opção vem desligada na sua linha), e o sistema não deixa apagar a última conta que ainda abre a Administração.',
        'Na dúvida, DESATIVE: corta o acesso do mesmo jeito, é reversível com um clique e mantém a linha na tabela. Apagar é para conta criada por engano ou que não pode mais existir. A exclusão entra na aba "Auditoria".',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Encerrar as sessões abertas de alguém',
      itens: [
        'Serve para computador esquecido logado, aparelho perdido ou suspeita de senha vazada: a pessoa passa a precisar entrar de novo com e-mail e senha nos aparelhos em que estava conectada.',
        'Em "⋯" › "Encerrar sessões abertas…", o diálogo "Encerrar as sessões de …?" explica o efeito e o limite. Confirme em "Encerrar sessões".',
        'O limite está escrito na própria tela e é honesto: isto NÃO corta o acesso na hora. O que cai é a renovação — se a pessoa estiver com o sistema aberto neste momento, aquela sessão pode continuar valendo por até cerca de 1 hora.',
        'Para cortar imediatamente, leitura e escrita, o caminho é "Desativar" o acesso dela: aí vale no carregamento seguinte de tela. Encerrar sessões não mexe no cargo, nas filiais nem no histórico.',
        'Encerrar as sessões da sua própria conta inclui a aba em que você está: você também vai precisar entrar de novo. O encerramento entra na aba "Auditoria".',
      ],
    },
    {
      tipo: 'nota',
      texto: `Quem tem o cargo ${PAPEL_ROTULO.dev} é intocável para os demais: para quem não tem esse cargo, "Editar" e "Desativar" na linha dele vêm desligados, com a explicação "Gerido por desenvolvedor — só outro ${PAPEL_ROTULO.dev} altera, desativa ou apaga esta conta.". Conceder o cargo é da mesma família: ele nem aparece na lista de cargos de quem não o tem, e forjar o endereço não adianta — a recusa é "${MSG_SO_DEV_GERE_DEV}", e vem antes de qualquer gravação.`,
    },

    {
      tipo: 'titulo',
      id: 'usuarios-reenvio',
      texto: 'Quem já tem conta e esqueceu a senha',
    },
    {
      tipo: 'passos',
      titulo: 'Reenviar o acesso de quem já existe',
      itens: [
        'Não há tela de "esqueci minha senha": a tela de login diz "Esqueceu a senha? Peça a um administrador para reenviar o convite."',
        'Em Administração › Usuários, use "Convidar usuário" e informe o MESMO e-mail da pessoa.',
        'O sistema reconhece que a conta já existe e a tela troca para "Link de acesso gerado", explicando que ao abrir o link a pessoa clica em "Continuar", informa nome e sobrenome e define uma nova senha.',
        'Copie o link e entregue como no convite normal. Na tela seguinte, quem JÁ tinha informado nome e sobrenome os encontra preenchidos e só confere; quem nunca informou (a coluna "Nome" ainda mostra o e-mail dela) encontra os dois campos VAZIOS e precisa preenchê-los para concluir — é o caso de todo mundo que já usava o sistema antes de os dois campos existirem.',
        'O cargo e as filiais de quem já existe NÃO se perdem nem se redefinem por aqui: reenviar o acesso só devolve a senha. Para mudar o cargo, edite a linha da pessoa.',
      ],
    },

    {
      tipo: 'titulo',
      id: 'usuarios-auditoria',
      texto: 'A trilha das ações administrativas',
    },
    {
      tipo: 'lista',
      itens: [
        'A área de usuários tem duas abas: "Usuários" e "Auditoria". A segunda é a lista do que foi feito na administração, do mais recente para o mais antigo, com as colunas "Quando", "Ação", "Sobre", "Detalhe" e "Quem fez".',
        `Ficam registrados: ${ACOES_AUDITADAS}.`,
        'A lista tem filtro por tipo de ação (o seletor começa em "Todas as ações") — é por ele que se responde "quem promoveu essa pessoa a administrador?" ou "quem revogou aquela senha?".',
        'A trilha só recebe linhas novas: ninguém edita nem apaga um registro, nem quem é administrador. Um registro errado se corrige com a ação certa depois, que entra como uma linha nova.',
        'A aba é visível só a quem abre a Administração, e vale uma olhada de vez em quando — quem ainda precisa de acesso, quem virou consulta, qual senha antiga ainda circula.',
      ],
    },

    {
      tipo: 'titulo',
      id: 'senhas-criar',
      texto: 'Criar e entregar uma senha de acesso',
    },
    {
      tipo: 'passos',
      titulo: 'Criar uma senha de acesso aos relatórios',
      itens: [
        'Vá a Administração › Senhas de acesso. A tabela traz "Rótulo", "Criada em", "Último uso", "Status" e "Ações"; sem nenhuma criada, a tela diz "Nenhuma senha de acesso criada ainda."',
        'Use "Nova senha". No diálogo "Nova senha de acesso", preencha o "Rótulo" — é o nome que identifica quem vai usar aquela senha. O campo mostra um exemplo em cinza, só como sugestão de formato: escreva ali o nome da filial ou do parceiro que vai usar a senha, porque é por esse rótulo que você a revoga depois.',
        'Digite a "Senha" (mínimo 8 caracteres) ou use o botão "Gerar", que monta uma senha forte sem caracteres ambíguos.',
        'Use "Criar senha". A tela vira "Senha criada — copie agora": esta é a ÚNICA vez que a senha aparece. Use "Copiar" e guarde-a antes de fechar com "Concluir".',
        'Entregue à pessoa duas coisas: o endereço do relatório e a senha. Ela entra pela página de acesso por senha, digita a senha em "Senha de acesso" e usa "Entrar".',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'O que a senha de acesso abre: só os relatórios. Quem entra por ela não vê ativos, movimentações, itens, pendências, a administração nem esta documentação, e não tem como exportar as listas de operação. A coluna "Último uso" mostra quando aquela senha foi usada pela última vez (ou "nunca", se ninguém a usou ainda) — é o jeito de saber se uma senha antiga ainda está em uso antes de revogá-la.',
    },

    { tipo: 'titulo', id: 'senhas-revogar', texto: 'Revogar e reativar' },
    {
      tipo: 'passos',
      titulo: 'Revogar uma senha de acesso',
      itens: [
        'Em Administração › Senhas de acesso, use "Revogar" na linha da senha. Como a ação corta o acesso de alguém, ela pede confirmação: o diálogo "Revogar senha de acesso?" nomeia o rótulo e explica que quem usa aquela senha perde o acesso aos relatórios no próximo carregamento.',
        'O foco começa em "Cancelar" — o Enter nunca revoga sem querer. Confirme em "Revogar".',
        'A linha passa a mostrar o status "Revogada" e o botão vira "Reativar". Reativar é um clique só, na mesma lista: só o caminho destrutivo pede confirmação.',
        'Cada senha é independente: revogar uma não afeta as outras. Se uma senha vazou, revogue só aquela e crie uma nova com outro rótulo.',
        'Se a rede cair no meio, o aviso diz em que estado a senha ficou ("Não foi possível revogar a senha — ela continua ativa.") — não revogue "por garantia": recarregue a lista e confira o status.',
      ],
    },

    {
      tipo: 'tabela',
      colunas: ['O que aparece', 'O que significa', 'Como sair'],
      linhas: [
        [
          `Só e-mails ${DOMINIOS_TEXTO} podem ser convidados.`,
          'O e-mail digitado está fora dos domínios corporativos.',
          'Peça o e-mail corporativo da pessoa. Não há como convidar um e-mail pessoal.',
        ],
        [
          'Esta ação é restrita a administradores.',
          `Você abriu um caminho da Administração com um cargo que não a alcança — ela é dos cargos ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.dev}. Nada foi gravado.`,
          `Peça a um ${PAPEL_ROTULO.admin} para fazer, ou para mudar o seu cargo se essa passou a ser a sua função.`,
        ],
        [
          MSG_SO_DEV_GERE_DEV,
          `Você tentou dar o cargo ${PAPEL_ROTULO.dev} a alguém, ou mudar o cargo, desativar ou reativar quem já o tem. Nada foi gravado.`,
          `Só um ${PAPEL_ROTULO.dev} mexe nisso. Peça a quem tem o cargo — mudar o SEU cargo não resolve, porque a recusa é da conta do outro lado.`,
        ],
        [
          MSG_SO_DEV_APAGA,
          `Apagar uma conta é privativo do cargo ${PAPEL_ROTULO.dev}. Nada foi apagado.`,
          'Para tirar o acesso de quem saiu, use "Desativar" na linha da pessoa: corta o acesso do mesmo jeito e é reversível.',
        ],
        [
          'Não foi possível gerar o link de convite. Tente de novo.',
          'A geração do convite falhou no caminho.',
          'Tente de novo pelo mesmo botão; o e-mail digitado continua no campo.',
        ],
        [
          'Não foi possível montar o link (endereço do site ausente).',
          'O sistema não conseguiu montar o endereço do convite.',
          'Avise o administrador do sistema: nenhum convite foi gerado.',
        ],
        [
          'Seu link expirou. Peça um novo convite ao administrador.',
          'O link de convite passou da validade ou já tinha sido usado.',
          'Gere outro convite para o mesmo e-mail em Administração › Usuários.',
        ],
        [
          'Seu acesso foi desativado. Fale com um administrador.',
          'A conta foi desativada — por isso a tela devolve ao login e nada é gravado.',
          'Se foi engano, um administrador reativa a conta na tabela de usuários e o acesso volta no carregamento seguinte.',
        ],
        [
          'Não foi possível criar a senha.',
          'A senha de acesso não chegou a ser criada.',
          'Tente de novo — o rótulo e a senha digitados continuam no diálogo.',
        ],
        [
          'Senha inválida.',
          'A senha digitada na entrada dos relatórios não confere ou foi revogada.',
          'Confira o que foi entregue; se a senha foi revogada, crie e entregue uma nova.',
        ],
        [
          'Muitas tentativas. Aguarde um instante e tente de novo.',
          'Houve muitas tentativas seguidas de entrada por senha.',
          'Espere um pouco antes de tentar outra vez.',
        ],
      ],
      legenda: 'Mensagens do convite, do cargo e da senha de acesso, e a saída de cada uma.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'acesso-e-sessoes', ancora: 'acesso-cargos', texto: 'O que cada cargo vê e faz' },
        { slug: 'administracao' },
        { slug: 'problemas-import-e-acesso' },
        { slug: 'mensagens-de-erro' },
      ],
    },
  ],
}
