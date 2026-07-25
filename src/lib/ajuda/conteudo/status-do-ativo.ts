import { verbetesCategoria, verbetesStatus } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'
import type { StatusAtivo } from '@/lib/dominio'

// PROSA por enum: sem um texto para cada status, o TypeScript nao compila.
const DESC_STATUS: Record<StatusAtivo, string> = {
  em_estoque: 'Disponível na prateleira da TI, pronto para sair.',
  reservado: 'Separado para um colaborador ou finalidade, mas ainda não entregue.',
  em_uso: 'Entregue e em uso por um colaborador ou setor.',
  emprestado: 'Cedido em caráter temporário — espera-se a devolução.',
  em_triagem: 'Devolvido e aguardando conferência antes de voltar ao estoque.',
  em_manutencao: 'Em conserto ou assistência técnica.',
  defasado: 'Obsoleto / fim de vida útil — não deve mais ser distribuído.',
  descartado: 'Baixado em definitivo. Estado final, não retorna.',
  devolvido_fornecedor:
    'O fornecedor ficou com o equipamento (a manutenção não teve conserto) e o trocou. Baixa terminal — sai do inventário, como o Descartado.',
}

export const statusDoAtivo: PaginaAjuda = {
  slug: 'status-do-ativo',
  titulo: 'Status e categorias do ativo',
  resumo: 'Os nove estados, com o selo real de cada um.',
  categoria: 'consultar',
  termos: ['status', 'estado', 'selo', 'badge', 'categoria', 'glossario'],
  legado: ['status'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Todo ativo controlado individualmente (notebook, celular, monitor, desktop, tablet) está sempre em um destes estados. A cor do selo é a mesma em todo o sistema.',
    },
    { tipo: 'glossario', badge: 'status', itens: verbetesStatus(DESC_STATUS) },
    { tipo: 'titulo', id: 'categorias', texto: 'Categorias' },
    { tipo: 'paragrafo', texto: 'Cada ativo também pertence a uma categoria:' },
    {
      tipo: 'glossario',
      badge: 'neutro',
      itens: verbetesCategoria({}, 'Categoria de ativo controlado individualmente.'),
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'tipos-de-movimentacao', texto: 'O que leva de um estado a outro' },
        { slug: 'lista-de-ativos' },
      ],
    },
  ],
}
