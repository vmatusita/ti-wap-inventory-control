import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const administracao: PaginaAjuda = {
  slug: 'administracao',
  titulo: 'Administração: os cadastros de apoio',
  resumo: 'Filiais, motivos, catálogo de itens e kits.',
  categoria: 'fazer',
  termos: [
    'admin',
    'cadastro',
    'filial',
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
        'Todas as abas dividem o mesmo título "Administração" e a mesma barra: "Usuários", "Senhas de acesso", "Filiais", "Motivos", "Kits", "Itens" e "Importar". Mexa aqui quando faltar uma opção nas telas de operação (uma filial nova, um motivo que não existe, um item fora do catálogo) — não para consertar um registro já feito, que se corrige na ficha ou por estorno.',
    },
    {
      tipo: 'lista',
      itens: [
        `Usuários — as contas do sistema: convidar, definir o cargo e as filiais de escrita, desativar e reativar, e a trilha das ações administrativas. Só e-mails ${DOMINIOS_TEXTO} podem ser convidados. Trocar o e-mail de uma conta, apagar uma conta e encerrar as sessões de alguém são ações do cargo ${PAPEL_ROTULO.dev}, e só aparecem para ele.`,
        'Senhas de acesso — senhas que dão ao visualizador acesso só aos relatórios. Revogar pede confirmação e tem efeito imediato, no carregamento de tela seguinte; a senha revogada pode ser reativada na mesma lista.',
        'Filiais — cadastro das filiais.',
        'Motivos — o vocabulário de motivos oferecido na tela de movimentação.',
        'Kits — os modelos do passo 2 da movimentação (tipo, motivo, termo, observação padrão e as categorias esperadas), aplicados com um clique em Nova movimentação.',
        'Itens — o catálogo de itens por quantidade (nome, grupo, ordem, estoque mínimo).',
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
        'Preencha o "Nome" — o "Slug" é sugerido a partir dele. O slug entra no endereço do relatório daquela filial, então evite mudá-lo depois de divulgar links.',
        'Na edição existe a caixa "Filial ativa". Desmarcá-la tira a filial das listas e dos seletores; quando ainda há ativos ali, a própria tela avisa a quantidade ao lado da caixa.',
        'Confirme em "Salvar". Slug repetido é recusado com "Já existe uma filial com esse slug."',
        'Filial com acervo não é desativada: a mensagem diz quantos ativos existem e pede que sejam transferidos antes. O mesmo vale para saldo de item — a mensagem diz quantos itens e quantas unidades, e manda zerar o estoque em Itens por quantidade.',
        'Filial desativada não some do passado: o saldo que ficou nela continua contando no Total da página de Itens, com a nota "inclui N de filial desativada".',
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
        'Em Administração › Itens, a tabela mostra "Nome", "Grupo", "Ordem", "Mínimo", "Lançamentos", "Status" e "Ações". Use "Novo item" ou "Editar".',
        'Preencha o "Nome" (é ele que aparece na busca do lançamento), escolha o "Grupo" e, se quiser, ajuste a "Ordem" — ela controla a posição do item dentro do bloco do grupo, na página de saldos.',
        'O campo "Estoque mínimo" é o ponto de reposição: 0 significa sem alerta, e a própria tela explica que acima de 0 o item ganha o aviso "repor" quando o estoque somado de todas as filiais ficar abaixo do número. Na coluna "Mínimo", 0 aparece como travessão.',
        'Item que já tem lançamento NÃO se exclui — a tela diz quantos existem e o caminho é desmarcar "Item ativo". Só item sem nenhum lançamento mostra o botão "Excluir".',
        'Nome repetido é recusado com "Já existe um item com esse nome." Se o homônimo estiver desativado, o caminho é reativá-lo em vez de criar outro.',
        'Item também pode ser criado sem passar por aqui, direto no diálogo de lançamento — é o mesmo catálogo, e por isso também é da Administração.',
      ],
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
