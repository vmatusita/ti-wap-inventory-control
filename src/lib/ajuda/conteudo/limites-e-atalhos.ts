import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
import { CAP_EXPORT } from '@/lib/csv'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { TAMANHO_MAX_ROTULO } from '@/lib/import/limites'
import { TAMANHOS_PAGINA, TAMANHO_PAGINA_PADRAO } from '@/lib/ativos/lista'
import { MOV_PAGE_SIZE } from '@/lib/queries/movimentacoes'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// Todo teto desta pagina que EXISTE como constante exportada e lido da
// constante (regra de ouro): mudar o numero no codigo muda a documentacao no
// mesmo build. Os que ainda nao tem constante nomeada — os limites de
// caractere, que vivem como `.max()` inline nos schemas Zod, o tamanho de
// pagina de /pendencias e o do historico de itens — sao espelhos digitados; se
// um deles virar constante exportada, troque o literal pela constante aqui.
export const limitesEAtalhos: PaginaAjuda = {
  slug: 'limites-e-atalhos',
  titulo: 'Limites, tetos e atalhos',
  resumo: 'Quanto cabe em cada lote e o que cada tecla faz.',
  categoria: 'consultar',
  termos: [
    'limite',
    'teto',
    'maximo',
    'atalho',
    'tecla',
    'quantos',
    'pagina',
    'caracteres',
    'enter',
    'teclado',
  ],
  legado: ['como-fazer'],
  blocos: [
    { tipo: 'titulo', id: 'limites-tetos', texto: 'Quanto cabe de uma vez' },
    {
      tipo: 'tabela',
      colunas: ['Onde', 'Limite'],
      linhas: [
        ['Ativos num lote de movimentação', `${MAX_LOTE_MOVIMENTACAO} por vez`],
        ['Unidades num cadastro de compra (lista ou faixa)', `${MAX_LOTE_COMPRA} por vez`],
        ['Linhas num lançamento de itens (carrinho)', `${MAX_LINHAS_LOTE_ITEM} por lançamento`],
        ['Linhas num arquivo exportado (CSV)', `${CAP_EXPORT.toLocaleString('pt-BR')} por arquivo`],
        ['Arquivo do import de startup', `${TAMANHO_MAX_ROTULO} por arquivo (.csv ou .xlsx)`],
        ['Domínios de e-mail aceitos no convite', DOMINIOS_TEXTO],
      ],
      legenda: 'Passar do limite nunca corta em silêncio: o sistema avisa antes.',
    },
    { tipo: 'titulo', id: 'limites-paginas', texto: 'Tamanho das listas e dos campos' },
    {
      tipo: 'tabela',
      colunas: ['Onde', 'Quanto'],
      linhas: [
        [
          'Ativos por página',
          `${TAMANHOS_PAGINA.join(', ')} — à sua escolha; o padrão é ${TAMANHO_PAGINA_PADRAO}`,
        ],
        ['Movimentações por página', `${MOV_PAGE_SIZE}, fixo`],
        ['Pendências por página', '30, fixo'],
        ['Histórico de lançamentos de itens', '20 por página, fixo'],
        ['Mínimo para uma busca por digitação procurar', '2 caracteres'],
        ['Observação de movimentação, compra, estorno ou pendência', '500 caracteres'],
        ['Anotação na ficha e Observações da semana do relatório', '2.000 caracteres'],
        ['Chamado do fornecedor', '200 caracteres'],
        ['Nome de um kit', '80 caracteres'],
        ['Estoque mínimo de um item', '0 a 9999 (0 = sem aviso de reposição)'],
      ],
      legenda:
        'Só a lista de Ativos deixa escolher o tamanho da página — nas demais o número é fixo, e a navegação é pelos botões "Anterior" e "Próxima".',
    },
    { tipo: 'titulo', id: 'limites-atalhos', texto: 'Atalhos de teclado' },
    {
      tipo: 'atalhos',
      itens: [
        {
          teclas: 'Ctrl+K',
          acao: 'Abre (e fecha) a busca global — a paleta de comandos.',
          observacao:
            'Funciona mesmo com o cursor dentro de um campo. No Mac, ⌘K. Não abre por cima de uma janela de confirmação já aberta — só responde para fechar a si mesma.',
        },
        {
          teclas: '/',
          acao: 'Abre a mesma busca global.',
          observacao:
            'Só quando o cursor NÃO está num campo de texto, e só sem nenhuma tecla acompanhando. Com qualquer janela de confirmação aberta (inclusive a própria busca), não dispara.',
        },
        {
          teclas: 'N',
          acao: 'Abre uma nova movimentação, de qualquer tela.',
          observacao:
            'Não dispara com o cursor num campo, com uma janela de confirmação aberta, nem combinada com Ctrl, ⌘ ou Alt.',
        },
        {
          teclas: 'L',
          acao: 'Abre o lançamento de item.',
          observacao:
            'Só na página Itens. Não dispara com o cursor num campo nem com o lançamento já aberto — mas, ao contrário do N e do "?", ele ainda responde com a janela "Estornar lançamento" aberta.',
        },
        {
          teclas: '?',
          acao: 'Abre esta documentação.',
          observacao:
            'Vale o caractere, não a tecla: segurar Shift para digitar "?" é normal e não atrapalha. As mesmas guardas do N valem aqui.',
        },
        {
          teclas: '↑ ↓ · Enter · Esc',
          acao: 'Dentro da busca global: andar pela lista, abrir o escolhido e fechar.',
        },
        {
          teclas: 'Enter',
          acao: 'No fluxo de nova movimentação, avança de passo — e, na revisão, registra o lote.',
          observacao:
            'Não dispara quando o cursor está num campo de texto longo, num botão, numa lista suspensa, no item do menu "Aplicar kit" ou dentro da busca de ativos, onde Enter escolhe o resultado.',
        },
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Nenhum atalho de letra dispara enquanto você digita num campo; o N e o "?" também ficam calados com uma janela de confirmação aberta (o L é a exceção, e está dito na linha dele). Nenhum deles existe para quem entra só com a senha de acesso dos relatórios. Segurar a tecla também não repete a ação: o atalho responde a um toque, não à repetição automática.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'mapa-das-telas', ancora: 'teclado' },
        { slug: 'lista-de-ativos', texto: 'Ordenar, paginar e exportar a lista' },
        { slug: 'mensagens-de-erro', texto: 'O que o sistema diz ao estourar um limite' },
      ],
    },
  ],
}
