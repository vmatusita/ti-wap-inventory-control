import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const saldosEEstoqueMinimo: PaginaAjuda = {
  slug: 'saldos-e-estoque-minimo',
  titulo: 'Ler os saldos e o estoque mínimo',
  resumo: 'Consolidado × por filial, o selo "faltam N" e o selo "repor".',
  categoria: 'fazer',
  termos: [
    'saldo',
    'estoque minimo',
    'repor',
    'falta',
    'por filial',
    'reposicao',
    'exportar saldos',
  ],
  legado: ['itens', 'como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Use esta tela para responder "tem quantos, e onde?" e "o que precisa comprar?". Ela não conta equipamento com patrimônio — só os itens controlados por quantidade. Para saber o que ACONTECEU com um item (quem levou, quando entrou), o lugar é o histórico de lançamentos, em Itens → Histórico.',
    },
    {
      tipo: 'nota',
      texto:
        'Falta e repor são dois avisos DIFERENTES e podem aparecer na mesma linha. Falta (selo vermelho "faltam N") é déficit real — máx(0, reservado + em uso − total) —, ou seja, compromisso já assumido sem lastro. Repor (selo âmbar "repor") é ponto de reposição: acende quando o estoque fica abaixo do estoque mínimo configurado para aquele item em Administração › Itens. Mínimo 0 = item sem acompanhamento, nunca acende. Estoque IGUAL ao mínimo também não acende: o mínimo é o piso aceitável, não o gatilho. Desde 01/09/2026 o aviso SEGUE O FILTRO DE FILIAL: sem filtro ele compara com o estoque somado de todas as filiais; com uma filial filtrada, compara com o estoque DAQUELA filial, e a legenda no topo da página diz de quem são os números. Isso tem uma consequência que vale saber: com uma filial filtrada, um item pode acender "repor" mesmo havendo sobra na filial ao lado — a página está falando daquela prateleira, não do acervo inteiro. O selo continua colado no NOME do item, e nunca dentro de uma das colunas de filial.',
    },
    {
      tipo: 'lista',
      itens: [
        'Passar o mouse (ou tocar) no selo "repor" mostra a conta que o acendeu: o mínimo do item e o estoque com que ele foi comparado — a dica NOMEIA esse estoque ("estoque de todas as filiais", "estoque em Linhares", "estoque somado de 3 filiais"), conforme o filtro de filial da página.',
        'Passar o mouse no selo vermelho mostra o compromisso: quantas unidades estão reservadas para chamados e quantas há em estoque.',
        'O selo "ao vivo" no cabeçalho vira "atualizado agora" quando alguém lança alguma coisa enquanto você está na tela — os números se refrescam sem recarregar.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Acima da tabela ficam os números da lista inteira, do jeito que ela estiver filtrada: Em estoque, Em uso e Total, mais os cartões "A repor" e "Falta" — que só aparecem quando há algo a repor ou algum déficit. Eles contam TODAS as páginas do filtro, não só a que está na tela; quando os dois números diferem, o cartão diz quantos estão nesta página.',
    },
    { tipo: 'titulo', id: 'visoes', texto: 'Comparar as filiais de um item' },
    {
      tipo: 'nota',
      texto:
        'Desde 01/09/2026 a tabela tem UMA COLUNA POR FILIAL, sempre visível numa tela larga: cada coluna leva o nome da filial no cabeçalho e mostra quanto daquele item está na PRATELEIRA dela. É a resposta a "onde tem mouse sobrando?" sem clicar em nada — e, como as colunas ficam sempre no mesmo lugar, dá para descer a vista por uma filial e comparar todos os itens dela de uma vez.',
    },
    {
      tipo: 'nota',
      texto:
        'Para ver os QUATRO números de cada filial, abra a linha: numa tela larga, pela setinha à esquerda; no celular e no tablet, pelo botão "Ver as N filiais" que fica logo abaixo do nome do item. A linha se abre e mostra o mesmo item filial por filial — quanto tem na prateleira de cada uma, quanto está com as pessoas, o total daquela filial e o selo "faltam N" onde houver déficit. Você pode abrir quantas linhas quiser ao mesmo tempo. Até 31/08/2026 isso era um botão "Consolidado / Por filial" no topo, que TROCAVA as colunas da tabela inteira — e era a única tela do sistema em que um filtro fazia isso. Hoje o filtro de filial está sempre lá e vale sempre: escolher uma filial recorta os números da tabela E as colunas de filial mostradas. Se as colunas não somarem o Em estoque da linha, a própria linha explica por quê ("N deles em filial fora desta lista"), e a linha aberta repete a conta ("inclui N em estoque de filial fora desta lista") — filial desativada, ou fora do filtro, não ganha coluna, mas o saldo que ficou nela continua contando.',
    },
    {
      tipo: 'nota',
      texto:
        'A tabela vazia diz qual é o caso: "Nenhum item no catálogo" (nada cadastrado ainda, com o atalho "Ir para Administração → Itens"), "Nenhum item com esses filtros" (a busca, o grupo ou a filial não trazem nada), "Nenhum saldo nas suas filiais" (a lista abre recortada nas filiais em que você opera — as outras podem ter saldo, e o atalho "Ver todas as filiais" alarga) ou "Nenhum saldo ainda" (o catálogo existe, mas ninguém lançou nada).',
    },
    {
      tipo: 'nota',
      texto:
        'Viu sobra numa filial e falta em outra? Abra a linha do item: o ícone de setas ao lado da filial de origem abre a transferência já com o item e a origem preenchidos. Transferir mexe no estoque das duas filiais e NÃO mexe no Total — o Total é da TI inteira, e mover uma caixa de uma sala para outra não cria nem destrói caixa. Se o Total mudar depois de um remanejamento, o caminho usado foi o errado (ver a página de lançamento).',
    },
    { tipo: 'titulo', id: 'minimo', texto: 'Configurar o ponto de reposição' },
    {
      tipo: 'passos',
      titulo: 'Definir o estoque mínimo de um item',
      itens: [
        'Vá a Administração › Itens e edite o item. O campo "Estoque mínimo" é o ponto de reposição daquele item. O mínimo é UM SÓ por item — não existe mínimo por filial.',
        'Deixe 0 (o padrão, exibido como travessão na coluna Mínimo) para não acompanhar aquele item — nenhum aviso será emitido.',
        'A partir de 1, sempre que o estoque ficar ABAIXO do mínimo o item ganha o selo âmbar "repor" colado ao nome, na página Itens, e entra na conta do cartão "A repor" do topo. Os dois usam a mesma regra e o mesmo número: nunca discordam. Estoque igual ao mínimo ainda não acende — o mínimo é o piso aceitável.',
        'Filtrar a página por uma filial MUDA quem acende (desde 01/09/2026): o aviso passa a comparar o mínimo com o estoque daquela filial. Sem filtro, ele compara com o estoque somado de todas.',
        'O painel inicial mostra o card "Itens para repor" com os mais críticos primeiro (quem está mais longe do mínimo), o quanto falta para voltar ao mínimo e um link direto para o item. Sem nada a repor, o card não aparece. ATENÇÃO: esse card é SEMPRE do acervo inteiro — ele não tem filtro de filial. Se a página Itens estiver filtrada por uma filial, a contagem dela e a do painel podem não bater, e as duas estão certas: elas respondem perguntas diferentes.',
      ],
    },
    { tipo: 'titulo', id: 'saldos-exportar', texto: 'Levar os saldos para fora' },
    {
      tipo: 'lista',
      itens: [
        '"Exportar saldos", no cabeçalho da página, gera o arquivo com os itens que estão filtrados na tela.',
        'O arquivo é um só, chamado itens-saldos, e traz tudo o que a tela mostra: uma linha por item, com Grupo, Tipo, os cinco números do recorte (Total, Em estoque, Em uso, Reservado e Falta), a coluna Filial dizendo o que ele contém ("Consolidado", ou os nomes somados) e, ao lado, uma COLUNA POR FILIAL com o estoque e o "faltam" de cada uma — o mesmo que a linha aberta mostra. Até 31/08/2026 eram dois arquivos diferentes, um por visão da tela. O estoque mínimo continua sendo a única coisa que não vai no arquivo: ele existe só na tela.',
        '"Exportar histórico" é outro arquivo, e desde 31/08/2026 mora em outra tela: o botão está no cabeçalho de Itens → Histórico e leva os lançamentos filtrados LÁ, não os saldos daqui. Cada tela exporta o próprio recorte.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'itens-por-quantidade' },
        { slug: 'lancar-itens' },
        { slug: 'administracao', ancora: 'admin-itens', texto: 'Cadastrar o item no catálogo' },
        { slug: 'lista-de-ativos', ancora: 'exportar', texto: 'Como funcionam os arquivos de export' },
      ],
    },
  ],
}
