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
        'Use esta tela para responder "tem quantos, e onde?" e "o que precisa comprar?". Ela não conta equipamento com patrimônio — só os itens controlados por quantidade. Para saber o que ACONTECEU com um item (quem levou, quando entrou), o lugar é o histórico de lançamentos, logo abaixo da tabela de saldos.',
    },
    {
      tipo: 'nota',
      texto:
        'Falta e repor são dois avisos DIFERENTES e podem aparecer na mesma linha. Falta (selo vermelho "faltam N") é déficit real — máx(0, reservado + em uso − total) —, ou seja, compromisso já assumido sem lastro. Repor (selo âmbar "repor") é ponto de reposição: acende quando o estoque somado de TODAS as filiais fica abaixo do estoque mínimo configurado para aquele item em Administração › Itens. Mínimo 0 = item sem acompanhamento, nunca acende. Estoque IGUAL ao mínimo também não acende: o mínimo é o piso aceitável, não o gatilho. O aviso é sempre do consolidado, nunca do saldo de uma filial — julgar pelo recorte mandaria comprar o que está sobrando na filial ao lado; por isso, na visão Por filial, o selo "repor" fica embaixo da coluna Total e nunca numa coluna de filial. O painel inicial repete a mesma conta no card "Itens para repor", que só aparece quando há algo a repor.',
    },
    {
      tipo: 'lista',
      itens: [
        'Passar o mouse (ou tocar) no selo "repor" mostra a conta que o acendeu: o mínimo do item e o estoque de todas as filiais.',
        'Passar o mouse no selo vermelho mostra o compromisso: quantas unidades estão reservadas para chamados e quantas há em estoque.',
        'O selo "ao vivo" no cabeçalho vira "atualizado agora" quando alguém lança alguma coisa enquanto você está na tela — os números se refrescam sem recarregar.',
      ],
    },
    { tipo: 'titulo', id: 'visoes', texto: 'Comparar as filiais de um item' },
    {
      tipo: 'nota',
      texto:
        'Cada linha da tabela tem uma setinha à esquerda. Clicando nela, a linha se abre e mostra o mesmo item filial por filial: quanto tem na prateleira de cada uma, quanto está com as pessoas de cada uma, e o selo "faltam N" na filial onde houver déficit. É a resposta rápida para "onde tem mouse sobrando?", sem trocar o filtro cinco vezes. Você pode abrir quantas linhas quiser ao mesmo tempo.',
    },
    {
      tipo: 'nota',
      texto:
        'Até 31/08/2026 isso era um botão "Consolidado / Por filial" no topo, que TROCAVA as colunas da tabela inteira — e era a única tela do sistema em que um filtro fazia isso. Agora a comparação é o detalhe de cada linha, e o filtro de filial está sempre lá, valendo sempre: escolher uma filial recorta os números da tabela, e a linha aberta compara só as filiais escolhidas. Se a linha aberta não somar o Total da tabela, ela mesma explica por quê ("inclui N em estoque de filial fora desta lista") — filial desativada, ou fora do filtro, não ganha linha, mas o saldo que ficou nela continua contando.',
    },
    {
      tipo: 'nota',
      texto:
        'A tabela vazia diz qual é o caso: "Nenhum item no catálogo" (nada cadastrado ainda, com o atalho "Ir para Administração → Itens"), "Nenhum item com esses filtros" (a busca, o grupo ou a filial não trazem nada) ou "Nenhum saldo ainda" (o catálogo existe, mas ninguém lançou nada).',
    },
    {
      tipo: 'nota',
      texto:
        'Viu sobra numa filial e falta em outra? A visão Por filial é o lugar de resolver: o ícone de setas ao lado do número abre a transferência já com o item e a filial de origem preenchidos. Transferir mexe no estoque das duas filiais e NÃO mexe no Total — o Total é da TI inteira, e mover uma caixa de uma sala para outra não cria nem destrói caixa. Se o Total mudar depois de um remanejamento, o caminho usado foi o errado (ver a página de lançamento).',
    },
    { tipo: 'titulo', id: 'minimo', texto: 'Configurar o ponto de reposição' },
    {
      tipo: 'passos',
      titulo: 'Definir o estoque mínimo de um item',
      itens: [
        'Vá a Administração › Itens e edite o item. O campo "Estoque mínimo" é o ponto de reposição daquele item, contado sobre o estoque de TODAS as filiais somadas.',
        'Deixe 0 (o padrão, exibido como travessão na coluna Mínimo) para não acompanhar aquele item — nenhum aviso será emitido.',
        'A partir de 1, sempre que o estoque consolidado ficar ABAIXO do mínimo o item ganha o selo âmbar "repor" na página Itens, nas duas visões. Estoque igual ao mínimo ainda não acende: o mínimo é o piso aceitável.',
        'O painel inicial mostra o card "Itens para repor" com os mais críticos primeiro (quem está mais longe do mínimo), o quanto falta para voltar ao mínimo e um link direto para o item. Sem nada a repor, o card não aparece.',
        'Passar o mouse no selo mostra o mínimo e o estoque somado das filiais. O aviso é sempre do consolidado: filtrar a página por uma filial não muda quem acende.',
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
