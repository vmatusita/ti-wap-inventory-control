import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const listaDeMovimentacoes: PaginaAjuda = {
  slug: 'lista-de-movimentacoes',
  titulo: 'Achar uma movimentação já registrada',
  resumo: 'A resposta para "o que foi registrado hoje?".',
  categoria: 'fazer',
  termos: [
    'historico',
    'auditoria',
    'o que aconteceu',
    'quem registrou',
    'periodo',
    'busca',
    'plaqueta',
    'estornada',
  ],
  legado: ['como-fazer', 'movimentacoes'],
  blocos: [
    {
      tipo: 'nota',
      texto:
        'Tudo que foi registrado fica na LISTA de movimentações: o item "Movimentações" do menu lateral abre essa lista (com período, tipo, filial e busca), e é ali que se responde "o que foi registrado hoje?". Para registrar, use o botão "Nova movimentação" ou a tecla N — os dois continuam indo direto ao formulário, sem passar pela lista.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'Use esta lista para conferir o dia, achar quem registrou alguma coisa ou reconstruir o que aconteceu num período. Para o histórico de UM equipamento, prefira a linha do tempo da ficha: ela traz também as anotações e as ações de estorno.',
    },
    { tipo: 'titulo', id: 'movs-lista', texto: 'Abrir e filtrar a lista' },
    {
      tipo: 'passos',
      titulo: 'Achar uma movimentação já registrada (lista de movimentações)',
      itens: [
        'Abra Movimentações no menu lateral: a lista mostra tudo que já foi registrado, do mais recente para o mais antigo.',
        'Filtre por período (De / Até), por tipo e por filial — o botão de filial abre um painel de caixas e aceita mais de uma marcada; quem é Operador já entra com as filiais dele marcadas. Os chips "Hoje", "Ontem" e "7 dias" preenchem De/Até de um clique só (clicar de novo no chip já marcado limpa o período); ainda dá para digitar as datas à mão quando o período não for nenhum desses três. A busca é de um campo só: digite um patrimônio (WAP0001234 — "wap 1234" também serve, o sistema completa o formato) e vêm as movimentações daquele equipamento; digite um nome ("Fulano") e vêm as do colaborador.',
        'O botão "Minhas" filtra só as movimentações que VOCÊ registrou — útil para conferir o que lançou no dia sem separar o histórico de todo mundo.',
        'Cada linha traz a data do evento (com a hora do registro em letra menor, logo abaixo — as duas podem divergir quando algo é lançado retroativo), tipo, patrimônio (link para a ficha), colaborador, filial, quem registrou, a observação e o atalho "Duplicar". Estorno vem marcado como "estorno" e a movimentação desfeita, como "estornada" — nada é apagado do histórico. Quando um lote inteiro foi registrado de uma vez, as linhas dele aparecem juntas, separadas do restante por uma borda mais forte acima da primeira.',
        'Os filtros ficam no endereço da página: o link já vai filtrado quando compartilhado, voltar/avançar do navegador funciona e trocar um filtro volta para a primeira página.',
        'Para REGISTRAR, continue usando "Nova movimentação" (botão do topo, card do painel inicial ou a tecla N) — todos vão direto ao formulário.',
      ],
    },

    { tipo: 'titulo', id: 'movs-busca', texto: 'Como a busca decide o que procurar' },
    {
      tipo: 'paragrafo',
      texto:
        'A busca é de UM campo, então o sistema decide sozinho se o que você digitou é um patrimônio ou um nome — e diz qual escolheu, logo abaixo dos filtros. Isso evita concluir que "não existe" quando a procura foi no campo errado.',
    },
    {
      tipo: 'lista',
      itens: [
        'Patrimônio no formato da casa: "Procurando pelo patrimônio WAP0001234." — vale digitar só os números, ou com espaço, que o sistema completa o formato.',
        'Plaqueta fora do padrão (as que vieram das planilhas antigas): também é procurada, e a nota termina com "— exatamente como você digitou". Basta ser uma palavra só, sem espaço, com ao menos quatro caracteres e ao menos um número.',
        'Qualquer outra coisa cai no colaborador: "Procurando por colaborador que contenha “Fulano”." A nota lembra que, para buscar por patrimônio, ele deve ser digitado por inteiro.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Limitação de hoje: plaqueta formada SÓ por letras, sem nenhum número, não é distinguível de um nome de pessoa — a busca a trata como colaborador e não acha o equipamento por ela. Nesses casos, abra o ativo pela lista de Ativos (ou pela service tag, na busca do teclado) e leia o histórico na linha do tempo da ficha.',
    },

    { tipo: 'titulo', id: 'movs-linha', texto: 'Da lista para o evento' },
    {
      tipo: 'lista',
      itens: [
        'O patrimônio de cada linha é um link para a FICHA do ativo — é lá que estão o estorno e o texto completo da observação.',
        '"Duplicar", na última coluna, já abre "Nova movimentação" pré-preenchida com os mesmos dados desta linha (menos o ativo, que se escolhe de novo) — não é mais preciso passar pela ficha para isso. Some para movimentações do tipo estorno: duplicar um estorno reabriria uma discussão que já foi encerrada.',
        'Quando o mesmo patrimônio pertence a dois equipamentos, a linha ganha ao lado o selo "ST" com a service tag: sem ele, o histórico de duas máquinas se leria como o de uma só.',
        'Ativo sem plaqueta aparece com o selo "sem patrimônio", e o link para a ficha continua ali — é o único caminho até ele.',
        'A observação fica na coluna "Obs.", encurtada; passar o mouse (ou tocar, no celular) mostra o texto inteiro.',
        'Quando você chega por um link que aponta para uma movimentação específica, a ficha abre já rolada até ela, com a linha destacada por um contorno.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'A lista vazia distingue os dois casos. Com filtro: "Nenhuma movimentação com esses filtros" e a dica "Ajuste o período, o tipo, a filial ou a busca — ou limpe os filtros para ver tudo." Sem filtro nenhum: "Nenhuma movimentação registrada ainda", com o atalho "Registrar a primeira". Endereço com página ou data impossível não derruba a tela — o valor é ignorado e a lista abre no que existe.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'registrar-movimentacao' },
        { slug: 'tipos-de-movimentacao' },
        { slug: 'ficha-do-ativo', ancora: 'ficha-linha-do-tempo', texto: 'A linha do tempo da ficha' },
        { slug: 'corrigir-estorno-ajuste' },
      ],
    },
  ],
}
