import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const lancarItens: PaginaAjuda = {
  slug: 'lancar-itens',
  titulo: 'Lançar itens por quantidade',
  resumo: 'Um lançamento, várias linhas — e criar item sem sair da tela.',
  categoria: 'fazer',
  termos: ['lancar', 'carrinho', 'nota', 'entrada', 'atrelar', 'liberacao', 'consumivel'],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'passos',
      titulo: 'Lançar um item por quantidade',
      itens: [
        'Abra Itens (atalho: tecla L) e lance uma movimentação de item.',
        'Se o item já aparece na tabela de saldos, use o botão de lançar da própria linha: o formulário abre com o item preenchido e o cursor na quantidade. A filial vem junto quando a tela está filtrada por uma filial; na visão Por filial ela abre em branco (a linha vale para todas) — escolha a filial antes de salvar.',
        'Escolha o tipo (Entrada, Liberação, Atrelar, Devolução, Retorno ou Ajuste) — cada um afeta Total/Estoque de um jeito.',
        'Informe a quantidade e, quando fizer sentido, a pessoa/chamado. O Ajuste pede justificativa.',
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
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Estornar um lançamento de item',
      itens: [
        'No histórico do item, estorne o lançamento errado — ele gera um lançamento de retorno que anula o efeito no saldo.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'itens-por-quantidade', texto: 'O que cada tipo de lançamento faz no saldo' },
        { slug: 'saldos-e-estoque-minimo' },
      ],
    },
  ],
}
