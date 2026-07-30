import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// Porta de entrada da documentacao: o operador novo tem de sair daqui sabendo o
// que o sistema faz, que palavra significa o que e para onde ir em seguida. O
// teto do lote vem da CONSTANTE real (regra de ouro) — nunca digitado a mao.
export const comeceAqui: PaginaAjuda = {
  slug: 'comece-aqui',
  titulo: 'Comece aqui',
  resumo: 'O essencial em 10 minutos: o que o sistema faz, o que você registra e onde.',
  categoria: 'comecar',
  termos: [
    'inicio',
    'primeiros passos',
    'novo operador',
    'treinamento',
    'visao geral',
    'vocabulario',
    'o que e',
    'inventario',
  ],
  legado: ['conceito'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Este é o controle de estoque da TI da WAP. Ele guarda dois mundos: os EQUIPAMENTOS com patrimônio (notebooks, celulares, monitores, desktops, tablets), que têm ficha e histórico individuais, e os ITENS por quantidade (periféricos, acessórios e componentes), que têm apenas saldo.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'Seu trabalho no dia a dia é um só: registrar o que aconteceu. Todo o resto — o status de cada equipamento, o saldo de cada item, o relatório da semana — é calculado a partir do que você registrou.',
    },
    { tipo: 'titulo', id: 'quatro-coisas', texto: 'As quatro coisas que sustentam tudo' },
    {
      tipo: 'lista',
      itens: [
        'A movimentação é a fonte da verdade — você registra o evento uma vez e o estado se atualiza sozinho. Nunca se edita o status à mão.',
        'O equipamento é identificado pelo PAR patrimônio + service tag — o patrimônio pode repetir em casos raros; a service tag desempata.',
        'Existem duas portas de acesso — quem tem login entra com a conta corporativa e recebe um cargo, que decide o que pode registrar (todos os cargos leem tudo); quem só precisa acompanhar de fora entra com uma senha de acesso e vê apenas os relatórios.',
        'Pendências é a esteira de regularização — o que ficou faltando (termo sem assinatura, acessório que não voltou, ativo sem patrimônio) fica visível numa fila até alguém resolver.',
      ],
    },
    { tipo: 'titulo', id: 'comecar-vocabulario', texto: 'As palavras que o sistema usa' },
    {
      tipo: 'tabela',
      colunas: ['Palavra', 'O que quer dizer'],
      linhas: [
        [
          'Ativo',
          'Um equipamento com patrimônio: notebook, desktop, monitor, celular ou tablet. Tem ficha própria e linha do tempo.',
        ],
        [
          'Movimentação',
          'O evento que você registra sobre um ativo — uma saída, uma devolução, uma transferência. É o que faz o status mudar.',
        ],
        [
          'Lote',
          `Vários ativos registrados na mesma movimentação: até ${MAX_LOTE_MOVIMENTACAO} de uma vez, com os mesmos dados.`,
        ],
        [
          'Item por quantidade',
          'Acessório, periférico ou componente controlado por saldo, sem patrimônio: mouse, fone, memória, SSD.',
        ],
        [
          'Lançamento',
          'O evento que você registra sobre um item por quantidade — o equivalente da movimentação no mundo dos saldos.',
        ],
        [
          'Filial',
          'A unidade onde o equipamento está. Toda contagem, todo saldo e todo relatório se recortam por filial.',
        ],
        [
          'Termo',
          'O documento de responsabilidade (ou de devolução) que o sistema gera em .docx a partir do que já está registrado.',
        ],
        [
          'Pendência',
          'Uma linha na fila de regularização: algo ficou faltando e precisa de uma ação sua.',
        ],
        [
          'Kit',
          'Um modelo salvo do passo 2 da movimentação, para o que se repete toda semana (ex.: o combo do colaborador novo).',
        ],
        [
          'Relatório gerado',
          'Uma foto congelada do relatório de um período. Depois de gerada, não muda mais — nem quando o dado muda.',
        ],
        [
          'Cargo',
          `O que a sua conta pode fazer: ${PAPEL_ROTULO.dev}, ${PAPEL_ROTULO.admin}, ${PAPEL_ROTULO.operador} ou ${PAPEL_ROTULO.consulta}. Os quatro leem o sistema inteiro; o cargo decide o que você REGISTRA (e, no caso do operador, em quais filiais).`,
        ],
      ],
      legenda:
        'Os nomes de status, de tipo de movimentação e de categoria têm páginas próprias em Consultar.',
    },
    { tipo: 'titulo', id: 'comecar-pendencias', texto: 'Pendências: a esteira de regularização' },
    {
      tipo: 'paragrafo',
      texto:
        'Pendência não é um cadastro à parte — ela NASCE do que você registra e morre quando a falta é sanada. Entregou o equipamento e o termo não voltou assinado? Pendência. O colaborador devolveu o notebook sem a fonte? Pendência, presa àquela devolução. O ativo entrou pelo import sem plaqueta? Pendência. Nada disso trava a operação: você registra do mesmo jeito, e o que ficou pelo caminho fica visível numa fila em vez de se perder.',
    },
    {
      tipo: 'nota',
      texto:
        'O item "Pendências" do menu lateral mostra um selo âmbar com quantas estão abertas — é o termômetro do dia. Abrir a fila, resolver de cima para baixo e ver o selo sumir é a rotina que mantém o inventário confiável.',
    },
    { tipo: 'titulo', id: 'primeiro-dia', texto: 'O que fazer no primeiro dia' },
    {
      tipo: 'passos',
      titulo: 'Um roteiro de 10 minutos',
      itens: [
        'Leia "A movimentação é a fonte da verdade" — é o conceito que explica por que o sistema não deixa você digitar um status.',
        'Abra "Ativos" e use a busca para achar um equipamento qualquer. Entre na ficha e veja a "Linha do tempo": cada linha é uma movimentação registrada, com quem registrou e quando.',
        'Abra "Movimentações" no menu lateral para ver o que a equipe registrou hoje.',
        'Abra "Pendências": é a lista do que precisa da sua ação.',
        'Abra "Itens" e repare nas quatro colunas de cada linha — total, estoque, atrelados e falta. É outro mundo, contado por quantidade.',
        'Abra "Relatórios": é a mesma verdade, agora arrumada por filial e por período — nada ali é digitado à mão.',
        'Pressione Ctrl+K em qualquer tela: essa é a forma mais rápida de achar um equipamento ou pular para uma tela.',
        'Quando precisar registrar algo, use "Nova movimentação" (ou a tecla N) e siga o guia correspondente aqui na documentação.',
      ],
    },
    { tipo: 'titulo', id: 'comecar-onde-pedir-ajuda', texto: 'Onde achar ajuda depois' },
    {
      tipo: 'lista',
      itens: [
        'O ícone "?" ao lado do título de uma tela abre direto a página desta documentação que descreve aquela tela.',
        'A tecla ? (de qualquer tela, fora de um campo de texto) traz você para o índice da documentação.',
        'No índice, a caixa "Buscar na documentação…" filtra as páginas enquanto você digita.',
        'O link "Manual completo (para imprimir)" junta tudo numa página só — bom para ler de ponta a ponta, achar com o Ctrl+F do navegador ou imprimir.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'conceito-movimentacao' },
        { slug: 'identidade-do-equipamento' },
        { slug: 'acesso-e-sessoes' },
        { slug: 'mapa-das-telas' },
        { slug: 'registrar-movimentacao', texto: 'Registrar a sua primeira movimentação' },
        { slug: 'status-do-ativo', texto: 'O que cada status significa' },
      ],
    },
  ],
}
