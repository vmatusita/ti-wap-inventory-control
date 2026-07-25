import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
import { CAP_EXPORT } from '@/lib/csv'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// Todo numero desta pagina vem da CONSTANTE real (regra de ouro): mudar o teto
// no codigo muda a documentacao no mesmo build.
export const limitesEAtalhos: PaginaAjuda = {
  slug: 'limites-e-atalhos',
  titulo: 'Limites, tetos e atalhos',
  resumo: 'Quanto cabe em cada lote e o que cada tecla faz.',
  categoria: 'consultar',
  termos: ['limite', 'teto', 'maximo', 'atalho', 'tecla', 'quantos'],
  legado: ['como-fazer'],
  blocos: [
    { tipo: 'titulo', id: 'limites', texto: 'Quanto cabe de uma vez' },
    {
      tipo: 'tabela',
      colunas: ['Onde', 'Limite'],
      linhas: [
        ['Ativos num lote de movimentação', `${MAX_LOTE_MOVIMENTACAO} por vez`],
        ['Unidades num cadastro de compra (lista ou faixa)', `${MAX_LOTE_COMPRA} por vez`],
        ['Linhas num lançamento de itens (carrinho)', `${MAX_LINHAS_LOTE_ITEM} por lançamento`],
        ['Linhas num arquivo exportado (CSV)', `${CAP_EXPORT.toLocaleString('pt-BR')} por arquivo`],
        ['Domínios de e-mail aceitos no convite', DOMINIOS_TEXTO],
      ],
      legenda: 'Passar do limite nunca corta em silêncio: o sistema avisa antes.',
    },
    { tipo: 'titulo', id: 'atalhos', texto: 'Atalhos de teclado' },
    {
      tipo: 'atalhos',
      itens: [
        {
          teclas: 'Ctrl+K',
          acao: 'Abre (e fecha) a busca global — a paleta de comandos.',
          observacao: 'Funciona mesmo com o cursor dentro de um campo. No Mac, ⌘K.',
        },
        {
          teclas: '/',
          acao: 'Abre a mesma busca global.',
          observacao: 'Só quando o cursor NÃO está num campo de texto.',
        },
        {
          teclas: 'N',
          acao: 'Abre uma nova movimentação, de qualquer tela.',
        },
        {
          teclas: 'L',
          acao: 'Abre o lançamento de item.',
          observacao: 'Só na página Itens.',
        },
        {
          teclas: '?',
          acao: 'Abre esta documentação.',
        },
        {
          teclas: '↑ ↓ · Enter · Esc',
          acao: 'Dentro da busca global: andar pela lista, abrir o escolhido e fechar.',
        },
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Nenhum atalho de letra dispara enquanto você digita num campo nem com uma janela de confirmação aberta — e nenhum deles existe para quem entra só com a senha de acesso dos relatórios.',
    },
    {
      tipo: 'links',
      itens: [{ slug: 'mapa-das-telas', ancora: 'teclado' }],
    },
  ],
}
