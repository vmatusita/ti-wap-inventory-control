import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const mapaDasTelas: PaginaAjuda = {
  slug: 'mapa-das-telas',
  titulo: 'Mapa das telas e navegação',
  resumo: 'Onde fica cada coisa, os atalhos de teclado e o modo escuro.',
  categoria: 'comecar',
  termos: ['menu', 'sidebar', 'navegacao', 'atalho', 'teclado', 'tema', 'escuro', 'dashboard'],
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
        ['Administração', 'Os cadastros de apoio: usuários, senhas de acesso, filiais, motivos, kits, itens e o import.'],
        ['Ajuda', 'Esta documentação.'],
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
        'Os atalhos globais são três: N abre uma nova movimentação, ? abre esta ajuda e, na página Itens, L abre o lançamento. Nenhum deles dispara enquanto você digita num campo nem com uma janela de confirmação aberta.',
        'O ícone "?" ao lado do título de cada tela abre esta documentação já na página daquela tela.',
        'Nada disso existe para quem entra só com a senha de acesso dos relatórios — busca e atalhos são do operador.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'limites-e-atalhos', texto: 'A tabela completa de atalhos' },
        { slug: 'comece-aqui' },
      ],
    },
  ],
}
