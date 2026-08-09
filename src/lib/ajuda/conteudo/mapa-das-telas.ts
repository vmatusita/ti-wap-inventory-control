import { STATUS_META } from '@/lib/dominio'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// O mapa da casa: menu, cabecalho, painel inicial, o "?" de cada tela, a propria
// documentacao, teclado, tema, carregamento e acessibilidade. Os nomes de status
// citados na tabela dos KPIs vem de STATUS_META (regra de ouro) — o rotulo do
// TILE e outra coisa e por isso aparece literal, como esta na tela.
export const mapaDasTelas: PaginaAjuda = {
  slug: 'mapa-das-telas',
  titulo: 'Mapa das telas e navegação',
  resumo: 'Onde fica cada coisa, os atalhos de teclado e o modo escuro.',
  categoria: 'comecar',
  termos: [
    'menu',
    'sidebar',
    'navegacao',
    'atalho',
    'teclado',
    'tema',
    'escuro',
    'dashboard',
    'painel inicial',
    'acessibilidade',
    'celular',
    'carregando',
    'desenvolvedor',
  ],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'O menu lateral é a espinha do sistema. Cada item abre uma tela com um propósito só:',
    },
    {
      tipo: 'tabela',
      colunas: ['Tela', 'Para que serve'],
      linhas: [
        ['Dashboard', 'A visão do dia: quantos equipamentos em cada estado, o que foi movimentado e o que está pendente.'],
        ['Ativos', 'A lista de todos os equipamentos com patrimônio, com busca, filtros e a ficha de cada um.'],
        ['Movimentações', 'A lista do que já foi registrado — a resposta para "o que aconteceu hoje?".'],
        ['Itens', 'Os saldos dos itens contados por quantidade e o histórico de lançamentos.'],
        ['Pendências', 'A fila do que precisa de ação: termo, itens faltantes, triagem e regularizações.'],
        ['Relatórios', 'O relatório ao vivo por filial e os relatórios gerados da semana.'],
        ['Administração', `Os cadastros de apoio: usuários, senhas de acesso, filiais, motivos, kits, itens e o import. Aparece para os cargos ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.dev}.`],
        [
          'Desenvolvedor',
          `As ferramentas técnicas de quem cuida do sistema por dentro: diagnóstico, checagens de integridade, a trilha completa de auditoria e a manutenção. Aparece só para o cargo ${PAPEL_ROTULO.dev} — nenhum outro cargo enxerga esse item nem alcança a tela.`,
        ],
        ['Ajuda', 'Esta documentação.'],
      ],
    },
    { tipo: 'titulo', id: 'mapa-cargos', texto: 'O que o seu cargo muda na tela' },
    {
      tipo: 'lista',
      itens: [
        `Todas as telas de consulta são iguais para os quatro cargos: as listas, as fichas, os saldos, os relatórios e esta documentação abrem para ${PAPEL_ROTULO.dev}, ${PAPEL_ROTULO.admin}, ${PAPEL_ROTULO.operador} e ${PAPEL_ROTULO.consulta}, nas cinco filiais.`,
        `Dois itens do menu somem conforme o cargo: "Administração" existe para ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.dev}, e "Desenvolvedor" existe só para ${PAPEL_ROTULO.dev}. Todo o resto do menu é igual para todo mundo.`,
        `${PAPEL_ROTULO.dev} vê o sistema como um ${PAPEL_ROTULO.admin} vê, com dois acréscimos: o item "Desenvolvedor" no menu e, na tabela de usuários, as ações de trocar o e-mail de uma conta, apagar uma conta e encerrar as sessões de alguém.`,
        `${PAPEL_ROTULO.consulta} não vê botão de registrar em tela nenhuma — nem o botão amarelo do cabeçalho, nem "Novo equipamento", "Lançar item", "Anotar", "Estornar", "Resolver" ou "Gerar relatório" —, nem as caixinhas de seleção da lista de ativos (que servem para montar um lote de movimentação), e os atalhos e comandos que registram também não respondem. O que ele vê é o sistema em modo leitura.`,
        `${PAPEL_ROTULO.operador} vê todos esses botões, e a lista de filiais das telas de registro oferece só as filiais em que ele escreve. Nos filtros de consulta, as cinco continuam lá.`,
        'Mudou o seu cargo agora? O próximo carregamento de tela já mostra a diferença — não é preciso sair e entrar de novo.',
      ],
    },
    { tipo: 'titulo', id: 'mapa-cabecalho', texto: 'A barra de cima' },
    {
      tipo: 'lista',
      itens: [
        'No computador, o campo "Buscar ativo, tela ou ação…" no meio da barra abre a busca global — a mesma coisa que o Ctrl+K faz (a dica da tecla fica à direita dele). No celular, no lugar do campo há a lupa "Buscar ativos e comandos".',
        'A marca "WAP · Estoque TI", à esquerda, é um link para o painel inicial. Para quem entra pela senha de acesso, ela leva ao relatório Consolidado.',
        `O botão amarelo "Nova movimentação" está em toda tela de quem registra, com a dica da tecla N ao lado. No celular ele fica só com o sinal de mais. Quem tem o cargo ${PAPEL_ROTULO.consulta} não o tem.`,
        'O avatar, no canto direito, abre o menu do usuário: o seu nome, o e-mail da conta, o seu cargo, o seletor "Tema" e o "Sair". Quem tem o cargo Operador vê ali também a linha "Escreve em: …" com as filiais em que pode registrar — é a resposta para "por que não aparece o botão de registrar nesta filial?".',
        'No celular não há menu lateral fixo: o botão "Abrir menu", à esquerda, traz o mesmo menu numa gaveta.',
        'No computador, o botão "Recolher" no pé do menu lateral deixa só os ícones e devolve largura para a tela — útil em notebook. A tecla [ faz o mesmo. Recolhido, passar o mouse ou o teclado por um ícone mostra o nome do item. A escolha fica guardada neste navegador, como o tema: ao voltar, o menu abre do jeito que você deixou. No celular nada muda.',
        'Um filete separa os grupos do menu: as telas do dia a dia em cima, depois "Administração" e "Desenvolvedor" (quando o seu cargo os vê) e, por último, "Ajuda".',
        'O item "Pendências" do menu carrega um selo âmbar com quantas estão abertas. A contagem se refaz a cada navegação e o selo some quando zera — e continua visível sobre o ícone com o menu recolhido.',
      ],
    },
    { tipo: 'titulo', id: 'mapa-painel', texto: 'O painel inicial' },
    {
      tipo: 'paragrafo',
      texto:
        'O "Dashboard" é a tela que abre quando você entra, e o subtítulo diz o recorte: "Visão geral do estoque de TI — todas as filiais". Ele não é só decoração — cada número dele é um atalho para a lista que o originou.',
    },
    {
      tipo: 'tabela',
      colunas: ['Tile', 'A lista que ele abre quando você clica'],
      linhas: [
        [
          'Total de ativos',
          'Todos os ativos do inventário — exatamente os sete estados que o tile soma. Descartados e devolvidos ao fornecedor ficam de fora, para o número da lista bater com o do tile.',
        ],
        ['Em uso', `Ativos no estado ${STATUS_META.em_uso.rotulo} — os que estão com um colaborador ou setor.`],
        ['Em estoque', `Ativos no estado ${STATUS_META.em_estoque.rotulo} — disponíveis para entrega.`],
        ['Reservados', `Ativos no estado ${STATUS_META.reservado.rotulo} — separados, aguardando a entrega.`],
        ['Em triagem', `Ativos no estado ${STATUS_META.em_triagem.rotulo} — devolvidos, ainda em conferência.`],
        ['Em manutenção', `Ativos no estado ${STATUS_META.em_manutencao.rotulo} — em conserto ou assistência.`],
        [
          'Reserva técnica',
          `Ativos no estado ${STATUS_META.defasado.rotulo} — os que a WAP mantém em posse, fora do uso corrente.`,
        ],
      ],
      legenda:
        `Os tiles do painel inicial são clicáveis: clicar equivale a abrir Ativos e aplicar aquele filtro de status. "Total de ativos" conta também os equipamentos no estado ${STATUS_META.emprestado.rotulo}, que não tem tile próprio aqui — por isso os seis tiles de estado somam menos que ele. O número dos emprestados aparece no relatório, no grupo "Equipamentos principais".`,
    },
    {
      tipo: 'lista',
      itens: [
        'Card "Itens para repor": aparece SÓ quando há item abaixo do estoque mínimo. Cada linha traz o estoque e o mínimo daquele item, o quanto falta repor e um link para ele; "ver em Itens" leva à tela completa. Sem nada a repor, o card não existe — a ausência é a boa notícia.',
        'Card "Pendências": as cinco mais antigas da fila, com "ver todas" para a tela inteira. Sem nenhuma, ele comemora; se a leitura falhar, ele diz "Não foi possível ler as pendências." em vez de fingir que a fila está vazia. Havendo conflito entre filiais, uma linha âmbar avisa quantos são e leva à mesa em Pendências — é o mesmo que o selo da barra lateral soma, para o card nunca comemorar ao lado de um selo diferente de zero.',
        'Card "Últimas movimentações": as cinco últimas registradas, com data, tipo, patrimônio e destino, e "ver todas" para a lista de movimentações.',
        'No rodapé, quatro cartões de atalho: "Nova movimentação", "Novo equipamento", "Relatórios" e "Ativos".',
      ],
    },
    { tipo: 'titulo', id: 'mapa-ajuda', texto: 'O "?" das telas e esta documentação' },
    {
      tipo: 'paragrafo',
      texto:
        'O ícone "?" ao lado do título de uma tela abre direto a página desta documentação que descreve aquela tela — não o índice, e sim a página certa. Ele existe no painel inicial, em Ativos, na ficha de um ativo, em "Novo equipamento", em Movimentações, em "Nova movimentação", em "Devolução ao fornecedor", em Itens, em Pendências, no relatório ao vivo, em "Relatórios gerados" e no cabeçalho de Administração, que vale para as sete abas — as abas com matéria própria (Usuários, Senhas de acesso, Kits e Importar) trazem um segundo, ao lado do texto de abertura. Não há "?" na tela de um relatório já congelado, nas telas públicas (login e entrada por senha) nem no item "Desenvolvedor", que é ferramenta técnica e por isso não tem página aqui. E nas duas telas de relatório que o visualizador por senha também abre — o relatório ao vivo e "Relatórios gerados" — ele só aparece para quem entrou como operador (isto é, com login — em qualquer cargo): esta documentação é de quem tem conta, e quem estivesse ali com uma senha de acesso cairia na tela de login.',
    },
    {
      tipo: 'lista',
      itens: [
        'A documentação é dividida em quatro categorias, por intenção: "Comece aqui" (entender o sistema), "Como fazer" (o passo a passo de cada tarefa), "Consultar" (glossários, limites e o significado de cada coisa) e "Resolver" (sintoma, causa e saída quando algo não funciona).',
        'No índice, a caixa "Buscar na documentação…" filtra os cartões enquanto você digita e mostra quantos resultados sobraram. Sem nenhum, ela avisa: "Nenhum resultado para a busca."',
        'Dentro de uma página, o bloco "Nesta página" lista os trechos (quando há mais de um) e o rodapé leva à anterior e à próxima da mesma categoria.',
        'O link "Manual completo (para imprimir)" junta todas as páginas numa só, na ordem do índice: é onde o Ctrl+F do navegador acha qualquer palavra, e é a versão que sai na impressora.',
        'Na busca global (Ctrl+K), a partir de duas letras aparece também um grupo "Ajuda" com as páginas desta documentação.',
        'Endereços antigos continuam valendo: um link para a ajuda de antes, colado num chamado, abre a página nova correspondente.',
      ],
    },
    { tipo: 'titulo', id: 'teclado', texto: 'Achar tudo pelo teclado' },
    {
      tipo: 'passos',
      titulo: 'Achar qualquer coisa pelo teclado (busca global e atalhos)',
      itens: [
        'Ctrl+K (ou ⌘K no Mac) abre a busca global em qualquer tela — a mesma caixa que a lupa do cabeçalho abre. A barra "/" também abre, desde que o cursor não esteja dentro de um campo de texto.',
        'Digite a partir de 2 letras: a busca acha o ativo por patrimônio, service tag, hostname, marca, modelo ou nome do colaborador. As setas ↑ ↓ andam pela lista, Enter abre a ficha do ativo escolhido e Esc fecha. Quando o patrimônio repete em dois equipamentos, a service tag aparece na linha para desempatar.',
        'A mesma caixa também leva para as telas ("Ir para Pendências") e dispara ações ("Nova movimentação", "Lançar item") — tudo sem tirar a mão do teclado.',
        'Os atalhos globais são quatro: N abre uma nova movimentação, ? abre o quadro de atalhos por cima da tela em que você está (com um link para esta documentação), [ recolhe e expande o menu lateral no computador, e, na página Itens, L abre o lançamento. Nenhum deles dispara enquanto você digita num campo; o N, o "?" e o "[" também ficam calados com uma janela de confirmação aberta — o L é a exceção, ele responde mesmo com uma confirmação na tela.',
        `Os dois atalhos que REGISTRAM (o N e o L) e os comandos de ação da busca global existem só para quem pode registrar: com o cargo ${PAPEL_ROTULO.consulta} eles não respondem, e a busca continua achando ativos, telas e páginas desta documentação. O "?" e o "[" são de todos os cargos.`,
        'O ícone "?" ao lado do título da tela abre a página desta documentação que fala daquela tela; a TECLA ? é outra coisa: ela abre o quadro de atalhos de teclado, sem tirar você da tela.',
        'Nada disso existe para quem entra só com a senha de acesso dos relatórios — busca e atalhos são do operador.',
      ],
    },
    { tipo: 'titulo', id: 'mapa-tema', texto: 'Claro, escuro ou igual ao sistema' },
    {
      tipo: 'passos',
      titulo: 'Trocar o tema da interface',
      itens: [
        'Clique no seu avatar, no canto direito do cabeçalho ("Abrir menu do usuário").',
        'Logo abaixo do seu nome está o seletor "Tema", com três opções: "Claro", "Escuro" e "Sistema". A opção em uso leva um ✓ — o estado nunca depende só da cor.',
        '"Claro" é o padrão do sistema: quem nunca abrir esse menu continua vendo tudo claro. "Escuro" troca na hora, sem recarregar a tela. "Sistema" acompanha a preferência do Windows.',
        'A escolha fica gravada NAQUELE navegador, não na sua conta: entrar de outra máquina, de outro navegador ou de uma janela anônima começa de novo no claro.',
        'Os avisos que aparecem no alto da tela seguem o tema escolhido aqui, e não o do Windows — nada de aviso escuro num app claro.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Quem entra só com a senha de acesso dos relatórios não tem esse menu: o cabeçalho reduzido dele não traz o seletor de tema, então ele vê o tema padrão daquele navegador.',
    },
    { tipo: 'titulo', id: 'mapa-carregando', texto: 'Enquanto a tela carrega' },
    {
      tipo: 'lista',
      itens: [
        'Ir para outra tela mostra primeiro um esqueleto cinza, no formato do conteúdo que está chegando — o título, os tiles, as linhas da tabela. Clique nenhum fica sem resposta.',
        'Trocar um filtro, uma aba, o período ou a página de uma lista acende uma barra fina amarela no alto da janela: a tela atual continua na frente enquanto os números novos vêm.',
        'Quem pediu ao computador para reduzir animações não vê a barra; o esqueleto continua avisando.',
        'Se algo falhar de verdade, o conteúdo é trocado por "Algo deu errado nesta tela", com os botões "Tentar de novo" e "Ir para o início" — o cabeçalho e o menu continuam de pé, e você não perde a navegação.',
      ],
    },
    { tipo: 'titulo', id: 'mapa-acessibilidade', texto: 'Sem mouse, com leitor de tela e no celular' },
    {
      tipo: 'lista',
      itens: [
        'Dá para operar tudo sem mouse: Tab e Shift+Tab andam pelos campos e botões, Enter aciona, Esc fecha o que estiver aberto, e o elemento em foco fica com um anel visível.',
        'Clicar no rótulo de um campo põe o cursor nele — inclusive nas listas de escolha (filial, tipo, motivo, categoria).',
        'Campo com erro fica marcado e o texto do erro é lido junto com o campo; nos formulários em lote, a caixa de erros é anunciada assim que aparece.',
        'Nas confirmações que desfazem ou apagam (estornar, revogar senha, desfazer assinatura), o foco começa no "Cancelar": um Enter distraído não confirma nada.',
        'As etapas de um fluxo — "Ativos", "Movimentação", "Revisão" — dizem em qual você está, e não apenas com cor.',
        'A cor nunca é o único sinal: a variação dos indicadores vem com a seta ▲▼, a opção de tema escolhida vem com ✓, e todo selo carrega o texto junto.',
        'Dicas que antes só apareciam com o mouse — a do selo "repor", a dos saldos por filial e as das células do relatório — também abrem pelo teclado, ao focar o número.',
        'No celular nada rola para o lado: a busca ocupa a largura toda e as colunas que não cabem nas tabelas do relatório abrem dentro da própria linha, pela setinha à direita. Os alvos de toque foram dimensionados para o dedo.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'limites-e-atalhos', texto: 'A tabela completa de atalhos' },
        { slug: 'comece-aqui' },
        { slug: 'lista-de-ativos', texto: 'A lista que os tiles do painel abrem' },
        { slug: 'resolver-pendencias', texto: 'A fila por trás do selo âmbar' },
        { slug: 'acesso-e-sessoes', texto: 'O que muda para quem entra por senha' },
      ],
    },
  ],
}
