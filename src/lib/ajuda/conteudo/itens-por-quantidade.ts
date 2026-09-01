import { verbetesGrupoItem, verbetesTipoLancamento } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// ITN-05a — os números de cada item, cada um com rótulo + explicação de UMA
// linha. Fonte única: tanto o bloco de texto desta página (que prefixa
// "rótulo — explicação") quanto as `Dica` dos cabeçalhos da tabela de `/itens`
// leem daqui — ninguém redigita o vocabulário nem a fórmula da coluna Falta.
//
// F42 — entrou **Em uso**, e a ORDEM aqui é a ORDEM DAS COLUNAS na tela. A F41
// batizou o número ("quanto está com as pessoas") e não o transformou em coluna;
// ele é derivado do que `rel_saldo_itens` já devolve, sem migration nenhuma —
// `emUsoDoSaldo` em `src/lib/itens/lista.ts` carrega a álgebra e a prova.
//
// ⚠ `Reservado` continua nesta lista e SAIU da tabela: desde a F41 nenhuma tela
// cria reserva, o número é zero em produção, e uma coluna permanentemente vazia é
// ruído. Ele continua no CSV, na linha expansível quando não for zero, e aqui —
// que é onde quem encontrar um lançamento antigo vai procurar o que ele significa.
export type ChaveNumeroItem = 'total' | 'estoque' | 'emUso' | 'atrelados' | 'falta'

// F43 — entrou o campo `curto`, e ele conserta um defeito de LEITURA, não é
// enfeite: até a v1.47.2 o significado de cada número morava só na `Dica` do
// cabeçalho, e dica é por definição o contrário de "entender ao bater o olho"
// (no celular ela quase não existe). Agora o cabeçalho da coluna e o cartão de
// métrica exibem esta linha de três ou quatro palavras SEMPRE, e a `Dica`
// continua existindo para o detalhe.
//
// ⚠ `curto` NÃO é rótulo alternativo. Os rótulos são intocáveis (decisão do
// Johnny, 01/09/2026: redesenho visual sim, revisão de vocabulário não) — isto é
// a explicação comprimida, e tem de dizer a MESMA coisa que `explicacao`.
export const NUMEROS_ITEM: readonly {
  chave: ChaveNumeroItem
  rotulo: string
  /** A explicação em três ou quatro palavras, para caber sob o rótulo. */
  curto: string
  explicacao: string
}[] = [
  {
    chave: 'total',
    rotulo: 'Total',
    curto: 'tudo que a TI possui',
    explicacao: 'Tudo que a TI possui daquele item (o patrimônio do almoxarifado).',
  },
  {
    chave: 'estoque',
    rotulo: 'Em estoque',
    curto: 'na prateleira agora',
    explicacao: 'O que está fisicamente disponível na prateleira agora.',
  },
  {
    // F42 — a coluna nova. Não existe no banco: é derivada do que a RPC de saldo
    // já devolve (total + falta − em estoque − reservado), e a conta bate item a
    // item com Σ saída − Σ devolução.
    chave: 'emUso',
    rotulo: 'Em uso',
    curto: 'com as pessoas',
    explicacao:
      'Quantas unidades estão com as pessoas agora — tudo que saiu menos tudo que voltou.',
  },
  {
    // F41 — a coluna SQL continua se chamando `atrelados` (renomeá-la custaria caro
    // e não resolve dor nenhuma); o que mudou é o nome que a tela dá ao número.
    // "Reservado" é a palavra que o ativo já usa para a mesma ideia.
    chave: 'atrelados',
    rotulo: 'Reservado',
    curto: 'separado para um chamado',
    explicacao:
      'Unidades separadas para um chamado, que devem voltar. Desde 31/08/2026 nenhuma tela cria reserva nova — este número existe para o histórico e tende a ficar em zero.',
  },
  {
    chave: 'falta',
    rotulo: 'Falta',
    curto: 'déficit já assumido',
    explicacao:
      'Déficit real: acende quando o que está reservado somado ao que está com as pessoas passa do Total — máx(0, reservado + em uso − total). Na operação normal fica sempre em zero; se acender, algum lançamento não fecha e vale conferir o histórico. É compromisso JÁ assumido, e aparece como selo vermelho "faltam N" — não é o mesmo que o aviso "repor".',
  },
]

export const itensPorQuantidade: PaginaAjuda = {
  slug: 'itens-por-quantidade',
  titulo: 'Itens por quantidade',
  resumo: 'Os grupos, os números de cada item e os seis tipos de lançamento.',
  categoria: 'consultar',
  termos: [
    'item',
    'acessorio',
    'componente',
    'periferico',
    'consumivel',
    'saldo',
    // F41 — os termos VELHOS continuam na busca de propósito: quem aprendeu a
    // operar com "atrelado" e "liberação" tem de achar a página que explica que
    // esses nomes mudaram. Termo de busca é porta de entrada, não rótulo de tela.
    'atrelado',
    'reservado',
    'em uso',
    'glossario',
    'liberacao',
    'devolucao de item',
    'acerto automatico',
    'regularizacao',
    'chamado',
  ],
  legado: ['itens'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Além dos ativos com patrimônio, a TI controla itens contados por quantidade (periféricos, acessórios e componentes). Eles não têm ficha individual — têm saldo. Dois grupos:',
    },
    { tipo: 'glossario', badge: 'neutro', itens: verbetesGrupoItem() },
    {
      tipo: 'nota',
      texto:
        'O grupo é só organização: aparece sob o nome do item na página Itens, alimenta o filtro "Grupo" da mesma página e diz em qual das duas seções do relatório ele é contado. Quem cria o item escolhe o grupo em Administração › Itens, e ele pode ser trocado depois sem afetar nenhum lançamento já feito.',
    },
    { tipo: 'titulo', id: 'itens-numeros', texto: 'Os números de cada item' },
    {
      tipo: 'paragrafo',
      texto:
        'Cada item tem cinco números, que significam coisas diferentes. Quatro deles são colunas da tabela — Total, Em estoque, Em uso e Falta. O quinto, Reservado, saiu da tabela em 31/08/2026: nenhuma tela cria reserva desde então e ele é zero em todas as filiais, mas continua existindo para o histórico, no arquivo exportado e na linha aberta de cada item quando não for zero.',
    },
    {
      tipo: 'lista',
      itens: NUMEROS_ITEM.map((n) => `${n.rotulo} — ${n.explicacao}`),
    },
    {
      tipo: 'nota',
      texto:
        'A conta que liga os números: o Total só muda com Compra e Ajuste. A Saída tira do Em estoque e põe no Em uso, sem mexer no Total (o item continua sendo da TI, só não está na prateleira); a Devolução faz o caminho de volta. É por isso que Total e Em estoque quase nunca são iguais — a diferença é exatamente o Em uso, a coluna que apareceu em 31/08/2026 para dizer esse número em vez de deixar você calculá-lo de cabeça.',
    },
    { tipo: 'titulo', id: 'itens-tipos', texto: 'Os tipos de lançamento' },
    {
      tipo: 'paragrafo',
      texto:
        'Desde 31/08/2026 o item usa as MESMAS palavras do equipamento: Compra, Saída, Devolução e Ajuste. São os quatro que a tela oferece, e cada um tem um efeito no saldo:',
    },
    { tipo: 'glossario', badge: 'tipoLanc', itens: verbetesTipoLancamento() },
    {
      tipo: 'nota',
      texto:
        'Eles andam em pares: o que sai por Saída volta por Devolução. Antes de 31/08/2026 havia um segundo par — "Atrelar" e a antiga "Devolução" de chamado —, que prendia a peça a um número de chamado e só se soltava por ali. Ele SAIU da tela: os lançamentos antigos continuam legíveis no histórico, agora com os nomes Reserva e Devolução de reserva, e nenhuma tela cria reserva nova. Ajuste exige uma justificativa e aceita quantidade negativa, para dar baixa numa contagem que não bateu.',
    },
    {
      tipo: 'nota',
      texto:
        'Você não precisa mais lançar o item ANTES de movimentar o equipamento. Quando um acessório volta com um notebook e o sistema nunca o viu sair, ou sai numa filial sem saldo, o registro do equipamento não é mais recusado: o sistema grava sozinho um Ajuste de acerto automático, com a justificativa pronta, e segue. O painel de sucesso avisa em uma linha o que foi acertado, e o histórico mostra a linha com o texto "Acerto automático" — nada acontece em silêncio.',
    },
    {
      tipo: 'nota',
      texto:
        'Cada tipo tem uma cor própria de pílula na coluna "Tipo" do histórico de lançamentos, a mesma em toda a tela e no relatório. Nenhum lançamento se apaga: o que se faz é estornar, e o estorno cria o lançamento inverso vinculado — os dois ficam marcados como "(estorno)" e "(estornado)" no histórico.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'lancar-itens' },
        { slug: 'saldos-e-estoque-minimo' },
        { slug: 'administracao', texto: 'Cadastrar um item no catálogo' },
        { slug: 'mensagens-de-erro', texto: 'Quando o lançamento é recusado' },
      ],
    },
  ],
}
