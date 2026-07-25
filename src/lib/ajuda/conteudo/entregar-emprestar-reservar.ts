import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const entregarEmprestarReservar: PaginaAjuda = {
  slug: 'entregar-emprestar-reservar',
  titulo: 'Entregar, emprestar e reservar',
  resumo: 'As três formas de o equipamento sair da prateleira.',
  categoria: 'fazer',
  termos: ['saida', 'entrega', 'emprestimo', 'reserva', 'colaborador', 'setor'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Três tipos tiram o equipamento do estoque, e a diferença entre eles é a expectativa de retorno.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'registrar-movimentacao' },
        { slug: 'tipos-de-movimentacao' },
        { slug: 'termos-de-responsabilidade' },
      ],
    },
  ],
}
