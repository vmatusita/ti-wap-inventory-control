import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const manutencao: PaginaAjuda = {
  slug: 'manutencao',
  titulo: 'Manutenção, do envio à troca',
  resumo:
    'Envio com chamado do fornecedor, retorno, devolução ao fornecedor e substituto.',
  categoria: 'fazer',
  termos: ['manutencao', 'conserto', 'fornecedor', 'chamado', 'troca', 'substituto', 'garantia'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Um equipamento que vai para conserto sai do estoque e volta por um de dois caminhos: consertado, ou substituído pelo fornecedor.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'tipos-de-movimentacao' },
        { slug: 'relatorio-ao-vivo', texto: 'Os casos de manutenção no relatório' },
        { slug: 'ficha-do-ativo' },
      ],
    },
  ],
}
