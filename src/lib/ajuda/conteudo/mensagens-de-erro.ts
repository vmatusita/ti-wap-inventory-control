import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const mensagensDeErro: PaginaAjuda = {
  slug: 'mensagens-de-erro',
  titulo: 'Mensagens de erro',
  resumo: 'O que o sistema diz, o que significa e como sair.',
  categoria: 'consultar',
  termos: ['erro', 'mensagem', 'nao deixou', 'bloqueado', 'recusou'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Quando o sistema recusa alguma coisa, ele explica em português o motivo. Esta é a tradução de cada recusa para "o que fazer agora".',
    },
    {
      tipo: 'links',
      itens: [{ slug: 'problemas-comuns' }, { slug: 'problemas-import-e-acesso' }],
    },
  ],
}
