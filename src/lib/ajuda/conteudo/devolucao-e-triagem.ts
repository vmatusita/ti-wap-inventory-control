import { rotulosAcessorios } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const devolucaoETriagem: PaginaAjuda = {
  slug: 'devolucao-e-triagem',
  titulo: 'Receber de volta: devolução e triagem',
  resumo: 'O checklist de acessórios e a conferência antes de voltar ao estoque.',
  categoria: 'fazer',
  termos: ['devolucao', 'triagem', 'checklist', 'acessorio', 'faltante', 'carregador'],
  legado: ['movimentacoes'],
  blocos: [
    {
      tipo: 'nota',
      texto:
        'Saída e Empréstimo exigem o Colaborador OU o Setor de destino (ao menos um). Na Devolução, marque no checklist os acessórios que NÃO voltaram — cada item marcado abre uma pendência de itens faltantes própria, presa àquela devolução e ao colaborador que devia devolver (não ao próximo dono do ativo). Ela se encerra na página Pendências, com desfecho manual; a Triagem OK NÃO apaga mais essas pendências.',
    },
    {
      tipo: 'lista',
      itens: [
        `Checklist de devolução (acessórios conferidos): ${rotulosAcessorios().join(', ')}.`,
        'O Motivo (quando aparece) vem do catálogo de motivos, mantido em Administração › Motivos.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'resolver-pendencias', texto: 'Resolver a pendência do acessório que não voltou' },
        { slug: 'registrar-movimentacao' },
        { slug: 'tipos-de-movimentacao' },
      ],
    },
  ],
}
