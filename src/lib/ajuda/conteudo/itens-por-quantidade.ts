import { verbetesGrupoItem, verbetesTipoLancamento } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// ITN-05a — os quatro números de cada item, cada um com rótulo + explicação de
// UMA linha. Fonte única: tanto o bloco de texto desta página (que prefixa
// "rótulo — explicação") quanto as `Dica` dos cabeçalhos Total/Estoque/
// Atrelados/Falta da visão consolidada (`app/(app)/itens/page.tsx`) leem
// daqui — ninguém redigita o vocabulário nem a fórmula da coluna Falta.
export type ChaveNumeroItem = 'total' | 'estoque' | 'atrelados' | 'falta'

export const NUMEROS_ITEM: readonly {
  chave: ChaveNumeroItem
  rotulo: string
  explicacao: string
}[] = [
  {
    chave: 'total',
    rotulo: 'Total',
    explicacao: 'Tudo que a TI possui daquele item (o patrimônio do almoxarifado).',
  },
  {
    chave: 'estoque',
    rotulo: 'Estoque',
    explicacao: 'O que está fisicamente disponível na prateleira agora.',
  },
  {
    chave: 'atrelados',
    rotulo: 'Atrelados',
    explicacao: 'Unidades vinculadas a um ativo/chamado, que devem retornar.',
  },
  {
    chave: 'falta',
    rotulo: 'Falta',
    explicacao:
      'Déficit real: acende quando o que está atrelado somado ao que está com as pessoas passa do Total — máx(0, atrelados + liberados − total). Na operação normal fica sempre em zero; se acender, algum lançamento não fecha e vale conferir o histórico. É compromisso JÁ assumido, e aparece como selo vermelho "faltam N" — não é o mesmo que o aviso "repor".',
  },
]

export const itensPorQuantidade: PaginaAjuda = {
  slug: 'itens-por-quantidade',
  titulo: 'Itens por quantidade',
  resumo: 'Os grupos, os quatro números e os seis tipos de lançamento.',
  categoria: 'consultar',
  termos: [
    'item',
    'acessorio',
    'componente',
    'periferico',
    'consumivel',
    'saldo',
    'atrelado',
    'glossario',
    'liberacao',
    'devolucao de item',
    'chamado',
  ],
  legado: ['itens'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Além dos ativos com patrimônio, a TI controla itens contados por quantidade (periféricos, acessórios e componentes). Eles não têm ficha individual — têm saldo. Dois grupos:',
    },
    { tipo: 'glossario', badge: 'neutro', itens: verbetesGrupoItem() },
    {
      tipo: 'nota',
      texto:
        'O grupo é só organização: define em que bloco o item aparece na tabela de saldos, o filtro "Grupo" da página Itens e em qual das duas seções do relatório ele é contado. Quem cria o item escolhe o grupo em Administração › Itens, e ele pode ser trocado depois sem afetar nenhum lançamento já feito.',
    },
    { tipo: 'titulo', id: 'itens-numeros', texto: 'Os quatro números de cada item' },
    {
      tipo: 'paragrafo',
      texto: 'Cada item mostra quatro números, que significam coisas diferentes:',
    },
    {
      tipo: 'lista',
      itens: NUMEROS_ITEM.map((n) => `${n.rotulo} — ${n.explicacao}`),
    },
    {
      tipo: 'nota',
      texto:
        'A conta que liga os quatro: o Total só muda com Entrada e Ajuste. Liberação e Atrelar tiram do Estoque sem mexer no Total (o item continua sendo da TI, só não está na prateleira); Devolução e Retorno repõem o Estoque. É por isso que Total e Estoque quase nunca são iguais — a diferença é o que está na mão das pessoas ou preso a um chamado.',
    },
    { tipo: 'titulo', id: 'itens-tipos', texto: 'Os seis tipos de lançamento' },
    {
      tipo: 'paragrafo',
      texto: 'Os lançamentos de item têm seis tipos, cada um com um efeito no saldo:',
    },
    { tipo: 'glossario', badge: 'tipoLanc', itens: verbetesTipoLancamento() },
    {
      tipo: 'nota',
      texto:
        'Eles andam em pares: o que sai por Liberação volta por Retorno; o que sai por Atrelar volta por Devolução. Escolher o par errado não some com a peça, mas embaralha a coluna Atrelados — e é a causa mais comum de a coluna Falta acender. Por isso o formulário de lançamento não pede o tipo pelo nome: ele pergunta "O que aconteceu?" (Chegou, Saiu da prateleira, Voltou à prateleira, Acerto de contagem) e, no saiu/voltou, se a peça estava com uma pessoa ou atrelada a um chamado — o par certo sai da resposta. Atrelar e Devolução exigem o número do chamado (é ele que amarra a ida à volta); Ajuste exige uma justificativa e aceita quantidade negativa, para dar baixa numa contagem que não bateu.',
    },
    {
      tipo: 'nota',
      texto:
        'Cada tipo tem uma cor própria de pílula na coluna "Tipo" do histórico de lançamentos, a mesma em toda a tela e no relatório. Nenhum lançamento se apaga: o que se faz é estornar, e o estorno cria o lançamento inverso vinculado — os dois ficam marcados como "(estorno)" e "(estornado)" no histórico.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'lancar-itens' },
        { slug: 'saldos-e-estoque-minimo' },
        { slug: 'administracao', texto: 'Cadastrar um item no catálogo' },
        { slug: 'mensagens-de-erro', texto: 'Quando o lançamento é recusado' },
      ],
    },
  ],
}
