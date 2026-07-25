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
        'Falta e repor são dois avisos DIFERENTES e podem aparecer na mesma linha. Falta (selo vermelho "faltam N") é déficit real — máx(0, atrelados + liberados − total) —, ou seja, compromisso já assumido sem lastro. Repor (selo âmbar "repor") é ponto de reposição: acende quando o estoque somado de TODAS as filiais fica abaixo do estoque mínimo configurado para aquele item em Administração › Itens. Mínimo 0 = item sem acompanhamento, nunca acende. Estoque IGUAL ao mínimo também não acende: o mínimo é o piso aceitável, não o gatilho. O aviso é sempre do consolidado, nunca do saldo de uma filial — julgar pelo recorte mandaria comprar o que está sobrando na filial ao lado; por isso, na visão Por filial, o selo "repor" fica embaixo da coluna Total e nunca numa coluna de filial. O painel inicial repete a mesma conta no card "Itens para repor", que só aparece quando há algo a repor.',
    },
    {
      tipo: 'lista',
      itens: [
        'Passar o mouse (ou tocar) no selo "repor" mostra a conta que o acendeu: o mínimo do item e o estoque de todas as filiais.',
        'Passar o mouse no selo vermelho mostra o compromisso: quantas unidades estão atreladas a equipamentos e quantas há em estoque.',
        'O selo "ao vivo" no cabeçalho vira "atualizado agora" quando alguém lança alguma coisa enquanto você está na tela — os números se refrescam sem recarregar.',
      ],
    },
    { tipo: 'titulo', id: 'visoes', texto: 'As duas visões da tabela' },
    {
      tipo: 'nota',
      texto:
        'A página Itens tem duas visões, no botão do topo. Consolidado (como a tela abre) soma todas as filiais — ou só a filial escolhida no filtro. Por filial põe uma coluna de estoque para CADA filial, lado a lado, mais a coluna Total: é a resposta rápida para "onde tem mouse sobrando?", sem trocar o filtro cinco vezes. O selo "faltam N" aparece na coluna da filial onde está o déficit.',
    },
    {
      tipo: 'nota',
      texto:
        'Na visão Por filial o filtro de filial some da barra (as filiais já estão todas na tela, uma por coluna) e o recorte por filial deixa de valer também para o histórico de lançamentos logo abaixo. A busca por nome e o filtro de grupo continuam valendo nas duas visões, e a visão escolhida fica no endereço da página — o link abre do mesmo jeito para quem receber. Se a coluna Total for maior que a soma das colunas, ela mesma explica por quê ("inclui N de filial desativada") — filial desativada não ganha coluna, mas o saldo que ficou nela continua contando no Total.',
    },
    {
      tipo: 'nota',
      texto:
        'A tabela vazia diz qual é o caso: "Nenhum item no catálogo" (nada cadastrado ainda, com o atalho "Ir para Administração → Itens"), "Nenhum item com esses filtros" (a busca, o grupo ou a filial não trazem nada) ou "Nenhum saldo ainda" (o catálogo existe, mas ninguém lançou nada).',
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
        'Duas coisas para saber antes de usar o arquivo numa reunião: na visão Por filial o export sai CONSOLIDADO (uma linha por item, não uma coluna por filial) — o próprio rótulo do arquivo diz "Consolidado"; e o estoque mínimo não vai no arquivo, ele existe só na tela.',
        '"Exportar histórico", no cabeçalho do histórico de lançamentos, é outro arquivo: leva os lançamentos filtrados, não os saldos.',
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
