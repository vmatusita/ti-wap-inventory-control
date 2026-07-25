import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const transferirDefasarDescartar: PaginaAjuda = {
  slug: 'transferir-defasar-descartar',
  titulo: 'Transferir, marcar defasado e descartar',
  resumo: 'Mudança de filial e as duas saídas de fim de vida.',
  categoria: 'fazer',
  termos: ['transferencia', 'filial', 'defasado', 'descarte', 'baixa', 'fim de vida'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Transferência muda o equipamento de filial sem mexer no estado dele. Defasado e Descarte encerram a vida útil — o primeiro sinaliza, o segundo dá baixa.',
    },
    {
      tipo: 'links',
      itens: [{ slug: 'tipos-de-movimentacao' }, { slug: 'registrar-movimentacao' }],
    },
  ],
}
