import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const administracao: PaginaAjuda = {
  slug: 'administracao',
  titulo: 'Administração: os cadastros de apoio',
  resumo: 'Filiais, motivos, catálogo de itens e kits.',
  categoria: 'fazer',
  termos: ['admin', 'cadastro', 'filial', 'motivo', 'catalogo', 'vocabulario'],
  legado: ['admin'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'A área de Administração concentra os cadastros de apoio. Tudo é nível único: todo operador vê e ajusta.',
    },
    {
      tipo: 'lista',
      itens: [
        `Usuários — convites de novos operadores. Só e-mails ${DOMINIOS_TEXTO} podem ser convidados.`,
        'Senhas de acesso — senhas que dão ao visualizador acesso só aos relatórios. Revogar pede confirmação e tem efeito imediato, no request seguinte; a senha revogada pode ser reativada na mesma lista.',
        'Filiais — cadastro das filiais.',
        'Motivos — o vocabulário de motivos oferecido na tela de movimentação.',
        'Kits — os modelos do passo 2 da movimentação (tipo, motivo, termo, observação padrão e as categorias esperadas), aplicados com um clique em Nova movimentação.',
        'Itens — o catálogo de itens por quantidade (nome, grupo, ordem, estoque mínimo).',
        'Importar — import de startup de uma filial por arquivo (CSV ou Excel .xlsx), para o go-live dela no sistema.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'usuarios-e-senhas' },
        { slug: 'kits-de-movimentacao' },
        { slug: 'import-de-startup' },
        { slug: 'saldos-e-estoque-minimo', ancora: 'minimo' },
      ],
    },
  ],
}
