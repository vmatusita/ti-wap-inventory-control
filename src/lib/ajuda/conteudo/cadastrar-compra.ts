import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const cadastrarCompra: PaginaAjuda = {
  slug: 'cadastrar-compra',
  titulo: 'Dar entrada de equipamentos novos',
  resumo: 'Compra avulsa, colada, por faixa — e "comprar outro igual".',
  categoria: 'fazer',
  termos: ['compra', 'novo equipamento', 'cadastro', 'faixa', 'nota fiscal', 'leitor'],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'passos',
      titulo: 'Dar entrada de ativos por compra',
      itens: [
        'Use o fluxo de compra para cadastrar ativos novos: um por vez, colando uma lista, ou por faixa de patrimônio.',
        `A faixa e a lista aceitam no máximo ${MAX_LOTE_COMPRA} unidades por vez.`,
        'Na aba "Colar lista" cada linha precisa do patrimônio E da service tag (a service tag é obrigatória): o separador pode ser TAB, ponto-e-vírgula ou vírgula, e dá para colar as duas colunas direto do Excel. O preview aponta linha por linha o que está errado — patrimônio sem service tag, fora do formato ou repetido dentro da própria lista.',
        'Na aba "Faixa" informe as service tags (obrigatórias): uma por linha, NA MESMA ORDEM da faixa — uma para cada patrimônio. O preview mostra os pares (WAP0001234 · ST-ABC123). Se a contagem não bater ("5 patrimônios × 3 service tags") ou faltar alguma, o erro aparece e o cadastro fica bloqueado até acertar — o mesmo vale para service tag repetida na lista.',
        'Marca, Modelo e Fornecedor sugerem o que já existe no acervo depois de 2 letras (Modelo filtra pela marca já escolhida). É só atalho contra "Dell" virar "DELL" na próxima compra: digitar um valor novo continua normal e nada é bloqueado.',
        'Filial e categoria voltam preenchidas com as da última compra feita naquele navegador — confira antes de cadastrar.',
        'Cada ativo entra como Em estoque.',
      ],
    },
    { tipo: 'titulo', id: 'outro-igual', texto: 'Repetir uma compra parecida' },
    {
      tipo: 'passos',
      titulo: 'Comprar outro igual (sem redigitar a ficha)',
      itens: [
        'Na ficha de um ativo, use "Comprar outro igual": abre a compra com categoria, marca, modelo, memória, armazenamento, processador, fornecedor e filial já preenchidos.',
        'No próprio formulário de compra há o botão "Repetir última compra", que preenche os mesmos campos com a última compra que VOCÊ registrou.',
        'Patrimônio e service tag NUNCA vêm preenchidos — são de cada equipamento e continuam sendo digitados, colados ou bipados.',
        'Quem manda quando há mais de uma fonte: o link "Comprar outro igual" vence o botão "Repetir última compra", que vence a memória de filial/categoria do navegador. Confira os campos antes de cadastrar — a nota fiscal é que decide.',
      ],
    },
    { tipo: 'titulo', id: 'leitor', texto: 'Com o leitor de código de barras' },
    {
      tipo: 'passos',
      titulo: 'Cadastrando com leitor de código de barras',
      itens: [
        'O leitor USB funciona como um teclado: ele digita o que leu e dá Enter. Não é preciso configurar nada.',
        'Clique no campo "Colar lista" do fluxo de compra e bipe as etiquetas em sequência — cada bipada cai numa linha.',
        'O mesmo vale no "Colar lista" da nova movimentação: bipe os equipamentos em sequência e depois clique em "Conferir lista".',
        'A service tag é obrigatória: bipe o patrimônio, digite ponto e vírgula (;) e bipe a service tag na mesma linha. Não use TAB para separar: dentro do campo, a tecla Tab pula para o controle seguinte — o TAB só vale quando a lista vem colada do Excel.',
        'Confira o preview antes de cadastrar: ele mostra quantos ativos entrarão e destaca erros e repetições.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'identidade-do-equipamento' },
        { slug: 'colar-e-bipar-lote' },
        { slug: 'ficha-do-ativo' },
      ],
    },
  ],
}
