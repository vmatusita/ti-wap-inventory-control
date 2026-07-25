import { verbetesCategoria, verbetesStatus } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'
import type { CategoriaAtivo, StatusAtivo } from '@/lib/dominio'

// PROSA por enum: sem um texto para cada status, o TypeScript nao compila.
const DESC_STATUS: Record<StatusAtivo, string> = {
  em_estoque:
    'Disponível na prateleira da TI, pronto para sair. É o estado em que o equipamento nasce (compra ou troca) e para onde ele volta depois da triagem e do retorno da manutenção.',
  reservado:
    'Separado para um colaborador ou finalidade, mas ainda não entregue. Continua fisicamente com a TI e some da conta de disponíveis — no relatório aparece em "Reservados", com o número do chamado.',
  em_uso:
    'Entregue e em uso por um colaborador ou setor. É o estado que cobra termo de responsabilidade e o que a devolução desfaz.',
  emprestado:
    'Cedido em caráter temporário — espera-se a devolução. A diferença para "Em uso" é a expectativa de retorno, e é ela que separa os dois nos relatórios.',
  em_triagem:
    'Devolvido e aguardando conferência antes de voltar ao estoque. Enquanto ficar aqui, o equipamento não conta como disponível — quem tira daqui é a triagem aprovada ou o envio à manutenção.',
  em_manutencao:
    'Em conserto ou assistência técnica. Daqui sai pelo retorno da manutenção (volta ao estoque) ou pela devolução ao fornecedor (baixa). O caso fica visível no relatório, com o tempo parado.',
  defasado:
    'Obsoleto / fim de vida útil — não deve mais ser distribuído. Continua em posse da WAP e aparece no relatório como "Reserva técnica"; ainda pode ser descartado depois.',
  descartado:
    'Baixado em definitivo. Estado final, não retorna. Sai das contagens de inventário, mas a ficha e a linha do tempo continuam guardadas para consulta.',
  devolvido_fornecedor:
    'O fornecedor ficou com o equipamento (a manutenção não teve conserto) e o trocou. Baixa terminal — sai do inventário, como o Descartado.',
}

// Uma linha de contexto por categoria: o rotulo vem de CATEGORIA_META, aqui so o
// que aquela categoria significa na operacao do dia a dia.
const DESC_CATEGORIA: Record<CategoriaAtivo, string> = {
  notebook: 'Equipamento principal de trabalho — o que mais circula entre entrega e devolução.',
  celular: 'Aparelho corporativo. É a categoria cujo termo pede os dados do aparelho (linha, IMEI).',
  monitor: 'Tela de mesa. Tem mais de um modelo de termo, escolhido na hora de gerar o documento.',
  desktop: 'Máquina fixa da estação de trabalho.',
  tablet: 'Aparelho de tela grande sem teclado, tratado como equipamento principal.',
  outro: 'Qualquer equipamento controlado individualmente que não se encaixa nas demais categorias.',
}

export const statusDoAtivo: PaginaAjuda = {
  slug: 'status-do-ativo',
  titulo: 'Status e categorias do ativo',
  resumo: 'Os nove estados, com o selo real de cada um.',
  categoria: 'consultar',
  termos: [
    'status',
    'estado',
    'selo',
    'badge',
    'categoria',
    'glossario',
    'situacao',
    'baixa',
    'reserva tecnica',
  ],
  legado: ['status'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Todo ativo controlado individualmente (notebook, celular, monitor, desktop, tablet) está sempre em um destes estados. A cor do selo é a mesma em todo o sistema.',
    },
    { tipo: 'glossario', badge: 'status', itens: verbetesStatus(DESC_STATUS) },
    {
      tipo: 'nota',
      texto:
        'O status NÃO se edita: ele é resultado da última movimentação registrada. A janela "Editar dados cadastrais" diz isso na própria descrição — "Status, colaborador e filial mudam apenas por movimentação". Quando a realidade fugiu do fluxo e nenhum tipo de movimentação descreve o que houve, o caminho é o ajuste, que exige o novo status e uma justificativa.',
    },
    {
      tipo: 'nota',
      texto:
        'Onde o status aparece: na coluna "Status" da lista de Ativos e no filtro "Status" dela; no topo da ficha do ativo; nos indicadores do relatório; e no par "de → para" de cada linha da linha do tempo, que mostra exatamente o estado antes e depois daquela movimentação. Dois estados são finais e não voltam por movimentação nenhuma: Descartado e Devolvido ao fornecedor.',
    },
    { tipo: 'titulo', id: 'status-categorias', texto: 'Categorias' },
    { tipo: 'paragrafo', texto: 'Cada ativo também pertence a uma categoria:' },
    {
      tipo: 'glossario',
      badge: 'neutro',
      itens: verbetesCategoria(DESC_CATEGORIA, 'Categoria de ativo controlado individualmente.'),
    },
    {
      tipo: 'nota',
      texto:
        'A categoria é escolhida no cadastro e não muda com as movimentações. Ela decide três coisas na prática: o filtro "Categoria" da lista de Ativos, o grupo em que o equipamento é contado no relatório ("Equipamentos principais" reúne notebooks, desktops, monitores, celulares e tablets) e qual modelo de termo o sistema oferece.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'tipos-de-movimentacao', texto: 'O que leva de um estado a outro' },
        { slug: 'lista-de-ativos' },
        { slug: 'relatorio-ao-vivo', texto: 'Onde cada estado é contado no relatório' },
      ],
    },
  ],
}
