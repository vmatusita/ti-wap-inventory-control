import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const corrigirEstornoAjuste: PaginaAjuda = {
  slug: 'corrigir-estorno-ajuste',
  titulo: 'Corrigir o que ficou errado',
  resumo: 'Quando usar estorno e quando usar ajuste.',
  categoria: 'fazer',
  termos: ['estorno', 'ajuste', 'errei', 'desfazer', 'corrigir', 'justificativa'],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'passos',
      titulo: 'Estornar uma movimentação',
      itens: [
        'Abra a ficha do ativo e vá à linha do tempo.',
        'Só a ÚLTIMA movimentação pode ser estornada — o estorno restaura exatamente o estado anterior.',
        'Precisa desfazer algo do meio do histórico? Use um Ajuste (com justificativa) em vez de estorno.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'conceito-movimentacao' },
        { slug: 'tipos-de-movimentacao' },
        { slug: 'ficha-do-ativo' },
      ],
    },
  ],
}
