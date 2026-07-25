import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
import { STATUS_META, TIPO_META } from '@/lib/dominio'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: o teto vem de MAX_LOTE_COMPRA e os rotulos, de dominio.ts.
const T = TIPO_META
const S = STATUS_META

export const cadastrarCompra: PaginaAjuda = {
  slug: 'cadastrar-compra',
  titulo: 'Dar entrada de equipamentos novos',
  resumo: 'Compra avulsa, colada, por faixa — e "comprar outro igual".',
  categoria: 'fazer',
  termos: [
    'compra',
    'novo equipamento',
    'cadastro',
    'faixa',
    'nota fiscal',
    'leitor',
    'cadastrar',
  ],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `Use "Novo equipamento" (Ativos › Novo equipamento) quando um equipamento entra no acervo por COMPRA. Não use para o aparelho que o fornecedor mandou no lugar de um devolvido — esse nasce pela tela de devolução ao fornecedor, como "${T.troca.rotulo}" —, nem para acessórios e periféricos controlados por quantidade, que são lançados na tela Itens.`,
    },
    {
      tipo: 'lista',
      itens: [
        'Antes de começar: tenha os patrimônios E as service tags (a service tag é obrigatória em todo cadastro manual) e saiba a filial que recebeu, a categoria, a marca e o modelo.',
        'A filial precisa existir e estar ativa em Administração › Filiais.',
        'A tela abre em duas abas: "Colar lista" (uma linha por equipamento — é também o caminho do cadastro avulso, com uma linha só) e "Faixa" (numeração sequencial).',
      ],
    },
    { tipo: 'titulo', id: 'compra-passos', texto: 'Cadastrar' },
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
        'No bloco "Dados do modelo", "Categoria *", "Filial que recebeu *", "Marca *" e "Modelo *" são obrigatórios; "Memória", "Armazenamento", "Processador", "Fornecedor", "Data da entrada" e "Observação (nº da nota fiscal etc.)" são opcionais — o campo de observação é o lugar da NF-e e da garantia.',
        'Confira o preview ("{n} equipamentos a cadastrar", com um chip por patrimônio) e conclua em "Cadastrar {n} equipamentos".',
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
    { tipo: 'titulo', id: 'compra-bastidores', texto: 'O que acontece por trás' },
    {
      tipo: 'lista',
      itens: [
        `Cada equipamento nasce "${S.em_estoque.rotulo}" na filial que recebeu, já com ficha própria e com uma movimentação de "${T.compra.rotulo}" na linha do tempo — é ela que fixa a filial de origem.`,
        'A compra aparece na tabela "Entradas" do relatório do período, com a pílula verde de compra, e engorda os KPIs "Total de ativos" e "Em estoque".',
        'O painel de sucesso lista os equipamentos cadastrados com link para cada ficha; "Cadastrar mais" recomeça sem sair da tela.',
        'Nada é cadastrado pela metade: se algum patrimônio falhar, a caixa "Nada foi cadastrado:" mostra os erros e nenhum equipamento entra.',
        'Equipamento sem plaqueta não se cadastra por aqui — o patrimônio é obrigatório no cadastro manual. Ativo sem patrimônio só existe quando veio do import de startup.',
      ],
    },
    { tipo: 'titulo', id: 'compra-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          '"Patrimônio fora do formato canônico"',
          'O cadastro manual exige o formato padronizado — prefixo mais 7 dígitos, como WAP0001234. Confira a etiqueta.',
        ],
        ['"Informe a service tag"', 'Toda linha precisa da service tag, sem exceção.'],
        [
          '"Linha {n}: {patrimônio} repetido na lista."',
          'O mesmo número aparece duas vezes no texto colado. Apague a linha extra.',
        ],
        [
          `"A faixa tem {n} itens; o máximo por lote é ${MAX_LOTE_COMPRA}."`,
          'Quebre a faixa em blocos menores e cadastre em duas rodadas.',
        ],
        [
          '"Já existe um ativo com esse patrimônio e service tag."',
          'O equipamento já está cadastrado. Procure-o na lista de ativos antes de cadastrar de novo.',
        ],
        [
          '"Preencha: {campos}."',
          'Falta um obrigatório do bloco "Dados do modelo" (categoria, filial, marca ou modelo).',
        ],
        [
          '"Não foi possível cadastrar agora. Os dados continuam preenchidos — verifique sua conexão e tente de novo."',
          'Falha de rede: nada entrou e o formulário continua preenchido. Repita.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'identidade-do-equipamento' },
        { slug: 'colar-e-bipar-lote' },
        { slug: 'ficha-do-ativo' },
        { slug: 'manutencao', texto: 'O substituto do fornecedor não é compra' },
        { slug: 'import-de-startup', texto: 'Carga inicial de uma filial por arquivo' },
      ],
    },
  ],
}
