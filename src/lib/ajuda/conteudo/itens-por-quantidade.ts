import { verbetesGrupoItem, verbetesTipoLancamento } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

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
  ],
  legado: ['itens'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Além dos ativos com patrimônio, a TI controla itens contados por quantidade (periféricos, acessórios e componentes). Eles não têm ficha individual — têm saldo. Dois grupos:',
    },
    { tipo: 'glossario', badge: 'neutro', itens: verbetesGrupoItem() },
    { tipo: 'titulo', id: 'numeros', texto: 'Os quatro números de cada item' },
    {
      tipo: 'paragrafo',
      texto: 'Cada item mostra quatro números, que significam coisas diferentes:',
    },
    {
      tipo: 'lista',
      itens: [
        'Total — tudo que a TI possui daquele item (o patrimônio do almoxarifado).',
        'Estoque — o que está fisicamente disponível na prateleira agora.',
        'Atrelados — unidades vinculadas a um ativo/chamado, que devem retornar.',
        'Falta — déficit real: acende quando o que está atrelado somado ao que está com as pessoas passa do Total — máx(0, atrelados + liberados − total). Na operação normal fica sempre em zero; se acender, algum lançamento não fecha e vale conferir o histórico. É compromisso JÁ assumido, e aparece como selo vermelho "faltam N" — não é o mesmo que o aviso "repor".',
      ],
    },
    { tipo: 'titulo', id: 'tipos', texto: 'Os seis tipos de lançamento' },
    {
      tipo: 'paragrafo',
      texto: 'Os lançamentos de item têm seis tipos, cada um com um efeito no saldo:',
    },
    { tipo: 'glossario', badge: 'tipoLanc', itens: verbetesTipoLancamento() },
    {
      tipo: 'links',
      itens: [{ slug: 'lancar-itens' }, { slug: 'saldos-e-estoque-minimo' }],
    },
  ],
}
