import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const conceitoMovimentacao: PaginaAjuda = {
  slug: 'conceito-movimentacao',
  titulo: 'A movimentação é a fonte da verdade',
  resumo:
    'Você registra o evento uma vez; status, estoque e relatórios derivam sozinhos.',
  categoria: 'comecar',
  termos: ['conceito', 'como funciona', 'estado', 'historico', 'imutavel'],
  legado: ['conceito'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'O sistema não guarda um "estado" digitado à mão. Cada evento (uma compra, uma saída, uma devolução) é registrado UMA vez como movimentação, e o estado do ativo, o estoque e os relatórios são calculados a partir desse histórico pelo próprio banco.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'Na prática: você nunca edita o status de um ativo diretamente — você registra o que aconteceu, e o status muda sozinho. Errou? Estorne a última movimentação (a linha do tempo volta ao que era) ou faça um Ajuste com justificativa.',
    },
    {
      tipo: 'nota',
      texto:
        'Por isso o histórico é imutável: movimentações não se apagam nem se editam. Corrigir é sempre um novo evento (estorno ou ajuste), com autor e data registrados.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'tipos-de-movimentacao', texto: 'Os 15 tipos e o que cada um provoca' },
        { slug: 'status-do-ativo' },
        { slug: 'corrigir-estorno-ajuste' },
      ],
    },
  ],
}
