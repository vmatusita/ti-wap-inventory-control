import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { TIPO_LANCAMENTO_META, type TipoLancamento } from '@/lib/dominio'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: os nomes dos seis tipos de lancamento NAO sao digitados aqui —
// saem de `TIPO_LANCAMENTO_META`, o mesmo lugar de onde o seletor do dialogo os
// tira. Tipo novo (ou rotulo renomeado) aparece nesta frase no mesmo build.
const TIPOS_LANCAMENTO_TEXTO = (Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[])
  .map((t) => TIPO_LANCAMENTO_META[t].rotulo)
  .join(', ')

export const lancarItens: PaginaAjuda = {
  slug: 'lancar-itens',
  titulo: 'Lançar itens por quantidade',
  resumo: 'Um lançamento, várias linhas — e criar item sem sair da tela.',
  categoria: 'fazer',
  termos: [
    'lancar',
    'carrinho',
    'nota',
    'entrada',
    'atrelar',
    'liberacao',
    'consumivel',
    'estornar',
    'criar item',
  ],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Use o lançamento quando a quantidade de um item mudar: chegou uma caixa de mouses, um teclado saiu com alguém, uma memória foi atrelada a um chamado. Não use para equipamento com patrimônio — esse tem ficha e movimentação próprias. E não use o Ajuste como atalho para os outros tipos: ele existe para corrigir contagem, com justificativa.',
    },
    {
      tipo: 'lista',
      itens: [
        'Pré-condição: o item precisa estar no catálogo (Administração › Itens). Se não estiver, dá para criá-lo sem sair do lançamento — veja abaixo.',
        'Pré-condição: escolha a filial certa. O saldo é por filial, e o lançamento não se transfere depois: erro de filial se corrige estornando e lançando de novo.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Lançar um item por quantidade',
      itens: [
        'Abra Itens (atalho: tecla L) e use "Lançar" — o diálogo se chama "Lançar quantidade".',
        'Se o item já aparece na tabela de saldos, use o botão de lançar da própria linha: o formulário abre com o item preenchido e o cursor na quantidade. A filial vem junto quando a tela está filtrada por uma filial; na visão Por filial ela abre em branco (a linha vale para todas) — escolha a filial antes de salvar.',
        `Escolha o tipo (${TIPOS_LANCAMENTO_TEXTO}) — cada um afeta Total/Estoque de um jeito, e a descrição do escolhido aparece logo abaixo do campo.`,
        'Informe a quantidade e, quando fizer sentido, a pessoa/chamado. Atrelar e Devolução exigem o número do chamado; o Ajuste pede justificativa em "Observação (justificativa do ajuste)" e aceita quantidade negativa (a nota ao lado lembra: "quantidade negativa = baixa").',
        'Confirme em "Lançar". O aviso "Lançamento registrado." confirma; o saldo da tela se atualiza sozinho.',
        '"Repetir último" traz de volta os campos do seu último lançamento — útil para uma sequência de entradas parecidas.',
      ],
    },

    { tipo: 'titulo', id: 'carrinho', texto: 'Vários itens de uma vez' },
    {
      tipo: 'passos',
      titulo: 'Lançar vários itens da mesma nota (carrinho)',
      itens: [
        'Uma nota com 5 itens é UM lançamento com 5 linhas — não é preciso abrir o formulário cinco vezes.',
        `Use "Adicionar item" para incluir uma linha (item + quantidade). O contador ao lado de "Itens" mostra quanto já foi usado do limite de ${MAX_LINHAS_LOTE_ITEM} linhas por lançamento.`,
        'Filial, tipo, data, chamado, colaborador e observação são COMUNS a todas as linhas — preencha uma vez. As regras do tipo (chamado obrigatório em Atrelar/Liberação, justificativa no Ajuste) valem para o lançamento inteiro.',
        'O mesmo item não pode aparecer duas vezes no carrinho: some as quantidades numa linha só.',
        'Cada linha é lançada por conta própria: se uma falhar (saldo insuficiente, por exemplo), as outras entram do mesmo jeito. O aviso diz "X de Y linhas lançadas" e o formulário fica só com as que falharam, com o motivo em cada linha — corrija e mande de novo, sem redigitar o resto.',
        '"Repetir último" e o botão de lançar da linha do saldo preenchem a PRIMEIRA linha do carrinho (e os campos comuns).',
        'Se a rede cair no envio, o aviso é explícito: nenhum lançamento foi registrado. O carrinho continua montado para você repetir.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Criar um item que não está no catálogo (sem sair do lançamento)',
      itens: [
        'Na lista de itens do carrinho, digite o nome do item novo (a partir de 2 letras).',
        'Não achou? Aparece a opção "Criar item «…»" na própria lista — alcançável pelas setas do teclado.',
        'Confirme o nome e escolha o grupo (Acessório ou Componente). A posição do item na tabela é calculada pelo sistema.',
        'O item entra criado e já selecionado naquela linha do carrinho — o lançamento segue sem interrupção. Ele passa a valer para todo mundo (é o mesmo catálogo de Administração › Itens).',
        'Nome que já existe no catálogo não é criado de novo: o sistema avisa "Já existe um item com esse nome." — procure-o na lista. Se o homônimo estiver DESATIVADO, ele é reativado e já entra na linha, com aviso dizendo isso.',
      ],
    },

    { tipo: 'titulo', id: 'historico', texto: 'Depois de lançar' },
    {
      tipo: 'passos',
      titulo: 'Achar um lançamento no histórico de itens',
      itens: [
        'Na página Itens, o histórico filtra por item, por tipo de lançamento e por período (De / Até), além da filial.',
        'Os filtros ficam na URL: o link já vem filtrado ao ser compartilhado, e voltar/avançar do navegador funciona. Trocar um filtro volta para a primeira página.',
        'A tabela traz "Data", "Tipo", "Item", "Qtd.", "Filial", "Chamado", "Obs." e a coluna de ações. Sem resultado, ela diz "Nenhum lançamento no filtro atual" e sugere ajustar o item, o tipo ou o período.',
        'O botão "Exportar histórico" leva para o Excel exatamente o que está filtrado ali.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Estornar um lançamento de item',
      itens: [
        'No histórico, use "Estornar" na linha do lançamento errado. O diálogo explica o que vai acontecer: cria o lançamento inverso vinculado (nada é apagado), e o estoque e os atrelados voltam ao estado anterior.',
        'O inverso NÃO é sempre do mesmo tipo: o sistema escolhe o que desfaz aquele efeito — uma Entrada é desfeita por um Ajuste negativo (com a observação automática dizendo que é estorno de entrada), uma Liberação por um Retorno, um Atrelar por uma Devolução e vice-versa, e um Ajuste por outro Ajuste de sinal contrário.',
        'Depois disso, a linha original aparece marcada como "(estornado)" e a nova, como "(estorno)". As duas continuam no histórico — é o rastro de auditoria.',
        'Um estorno não se estorna, e o mesmo lançamento não é estornado duas vezes: o sistema recusa com "Um estorno não pode ser estornado." e "Este lançamento já foi estornado."',
        'Se a rede cair, o aviso afirma o não-efeito ("o lançamento continua como estava") — não repita às cegas: recarregue e confira o histórico.',
      ],
    },

    {
      tipo: 'tabela',
      colunas: ['Mensagem', 'O que significa', 'Como sair'],
      linhas: [
        [
          'Estoque insuficiente: a operação deixaria o item com estoque negativo na prateleira.',
          'A quantidade que sai é maior que a que existe naquela filial.',
          'Confira a filial e o saldo; se a contagem física não bate, corrija com um Ajuste justificado antes.',
        ],
        [
          'A devolução é maior que a quantidade atrelada ao chamado.',
          'Está voltando mais do que foi atrelado àquele chamado.',
          'Confira o número do chamado e a quantidade original no histórico.',
        ],
        [
          'O retorno é maior que a quantidade liberada em aberto.',
          'Está voltando mais do que saiu com as pessoas.',
          'Procure o lançamento de Liberação no histórico e confira a quantidade.',
        ],
        [
          'Reserva e liberação exigem o número do chamado.',
          'O tipo escolhido precisa do chamado e ele ficou em branco.',
          'Preencha "Chamado" antes de lançar.',
        ],
        [
          'O ajuste exige uma justificativa (observação).',
          'Ajuste sem o porquê não entra.',
          'Escreva a justificativa no campo de observação do ajuste.',
        ],
        [
          'Ajuste inválido: deixaria o item com total negativo.',
          'A baixa é maior que o total que a TI possui daquele item.',
          'Revise a quantidade — o total nunca fica negativo.',
        ],
      ],
      legenda: 'Recusas mais comuns do lançamento de item.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'itens-por-quantidade', texto: 'O que cada tipo de lançamento faz no saldo' },
        { slug: 'saldos-e-estoque-minimo' },
        { slug: 'administracao', ancora: 'admin-itens', texto: 'O catálogo de itens' },
      ],
    },
  ],
}
