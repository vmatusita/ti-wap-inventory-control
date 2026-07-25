import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const comeceAqui: PaginaAjuda = {
  slug: 'comece-aqui',
  titulo: 'Comece aqui',
  resumo: 'O essencial em 10 minutos: o que o sistema faz, o que você registra e onde.',
  categoria: 'comecar',
  termos: ['inicio', 'primeiros passos', 'novo operador', 'treinamento'],
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
        'Existem duas portas de acesso — o operador entra com login corporativo e opera tudo; quem só precisa acompanhar entra com uma senha de acesso e vê apenas os relatórios.',
        'Pendências é a esteira de regularização — o que ficou faltando (termo sem assinatura, acessório que não voltou, ativo sem patrimônio) fica visível numa fila até alguém resolver.',
      ],
    },
    { tipo: 'titulo', id: 'primeiro-dia', texto: 'O que fazer no primeiro dia' },
    {
      tipo: 'passos',
      titulo: 'Um roteiro de 10 minutos',
      itens: [
        'Leia "A movimentação é a fonte da verdade" — é o conceito que explica por que o sistema não deixa você digitar um status.',
        'Abra Ativos e use a busca para achar um equipamento qualquer. Entre na ficha e veja a linha do tempo: cada linha é uma movimentação registrada.',
        'Abra Movimentações no menu lateral para ver o que a equipe registrou hoje.',
        'Abra Pendências: é a lista do que precisa da sua ação.',
        'Pressione Ctrl+K em qualquer tela: essa é a forma mais rápida de achar um equipamento ou pular para uma tela.',
        'Quando precisar registrar algo, use "Nova movimentação" (ou a tecla N) e siga o guia correspondente aqui na documentação.',
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
      ],
    },
  ],
}
