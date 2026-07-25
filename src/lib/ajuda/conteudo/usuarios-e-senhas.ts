import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: a lista de dominios corporativos NUNCA e digitada aqui — vem de
// `DOMINIOS_TEXTO`, o mesmo texto que o dialogo "Convidar operador" mostra e que a
// mensagem de erro repete. Dominio novo entra na lista uma vez e a documentacao
// acompanha no mesmo build.

export const usuariosESenhas: PaginaAjuda = {
  slug: 'usuarios-e-senhas',
  titulo: 'Operadores e senhas de acesso',
  resumo: 'Convidar quem opera e entregar (ou revogar) o acesso aos relatórios.',
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
  ],
  legado: ['admin', 'acesso'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `Há duas coisas diferentes aqui. Convidar um OPERADOR dá acesso completo ao sistema, e só vale para e-mails ${DOMINIOS_TEXTO}. Criar uma SENHA DE ACESSO dá a alguém de fora da TI a possibilidade de abrir os relatórios, e nada mais.`,
    },
    {
      tipo: 'nota',
      texto:
        'Use o convite de operador quando a pessoa vai REGISTRAR movimentações, cadastrar equipamento, lançar item ou resolver pendência. Não use convite para quem só quer acompanhar números: para isso existe a senha de acesso, que abre os relatórios sem criar conta e é revogável uma a uma. Todo operador tem o mesmo nível de acesso — não há perfis nem hierarquia, então convidar alguém é dar acesso a tudo.',
    },
    {
      tipo: 'lista',
      itens: [
        'Antes de convidar: tenha o e-mail corporativo da pessoa e um canal para entregar o link (WhatsApp, Teams, e-mail) — o sistema não envia nada sozinho.',
        'Antes de criar uma senha de acesso: saiba para quem ela vai, porque o rótulo da senha é o que identifica quem a usa na hora de revogar.',
      ],
    },

    { tipo: 'titulo', id: 'usuarios-convidar', texto: 'Convidar um operador' },
    {
      tipo: 'passos',
      titulo: 'Convidar um operador',
      itens: [
        'Vá a Administração › Usuários. O texto do topo mostra quantos operadores já têm acesso, e a tabela lista "Nome", "E-mail" e "Criado em".',
        'Use "Convidar usuário". O diálogo se chama "Convidar operador" e avisa o que vai acontecer: gera um link de convite para você enviar à pessoa (sem e-mail automático).',
        `Digite o "E-mail" da pessoa. Só e-mails ${DOMINIOS_TEXTO} são aceitos: fora desses domínios o botão fica desligado e aparece a mensagem "O e-mail precisa terminar com ${DOMINIOS_TEXTO}." — não há como convidar um e-mail pessoal.`,
        'Use "Gerar link" (o Enter no campo faz o mesmo). A tela troca para "Convite gerado — copie o link", com o endereço numa caixa e o botão "Copiar" ao lado (ele vira "Copiar" → "Copiado" quando dá certo).',
        'Cole o link no WhatsApp, no Teams ou no e-mail e mande para a pessoa. Depois use "Concluir" para fechar.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'O que acontece por trás: NENHUM e-mail é enviado pelo sistema — o link nasce na própria tela e a entrega é sua. Ele vale por tempo limitado; se expirar, é só gerar outro pelo mesmo caminho, quantas vezes precisar. Só o clique em ativar consome o link, então a prévia que o WhatsApp ou o Teams geram ao colar o endereço NÃO o invalida. A pessoa entra na tabela de Usuários assim que o link é gerado — e já é contada no total de operadores do topo. Enquanto ela não ativar o acesso, a coluna "Nome" mostra o e-mail dela; é o primeiro acesso que troca isso pelo nome e sobrenome que ela informar.',
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
      id: 'usuarios-reenvio',
      texto: 'Quem já tem conta e esqueceu a senha',
    },
    {
      tipo: 'passos',
      titulo: 'Reenviar o acesso de um operador que já existe',
      itens: [
        'Não há tela de "esqueci minha senha" para o operador: a tela de login diz "Esqueceu a senha? Peça a um administrador para reenviar o convite."',
        'Qualquer operador resolve isso: em Administração › Usuários, use "Convidar usuário" e informe o MESMO e-mail da pessoa.',
        'O sistema reconhece que a conta já existe e a tela troca para "Link de acesso gerado", explicando que ao abrir o link a pessoa clica em "Continuar", confere nome e sobrenome e define uma nova senha.',
        'Copie o link e entregue como no convite normal. Nome e sobrenome já vêm preenchidos com o que estava salvo — ela só confere.',
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
      legenda: 'Mensagens do convite e da senha de acesso, e a saída de cada uma.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'acesso-e-sessoes' },
        { slug: 'administracao' },
        { slug: 'problemas-import-e-acesso' },
      ],
    },
  ],
}
