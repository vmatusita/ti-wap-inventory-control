import { TIPO_META } from '@/lib/dominio'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const conceitoMovimentacao: PaginaAjuda = {
  slug: 'conceito-movimentacao',
  titulo: 'A movimentação é a fonte da verdade',
  resumo:
    'Você registra o evento uma vez; status, estoque e relatórios derivam sozinhos.',
  categoria: 'comecar',
  termos: [
    'conceito',
    'como funciona',
    'estado',
    'historico',
    'imutavel',
    'linha do tempo',
    'deriva',
  ],
  legado: ['conceito'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'O sistema não guarda um "estado" digitado à mão. Cada evento (uma compra, uma saída, uma devolução) é registrado UMA vez como movimentação, e o estado do ativo, o estoque e os relatórios são calculados a partir desse histórico pelo próprio banco.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'Na prática: você nunca edita o status de um ativo diretamente — você registra o que aconteceu, e o status muda sozinho. Errou? Estorne a última movimentação (a linha do tempo volta ao que era) ou faça um Ajuste com justificativa.',
    },
    {
      tipo: 'nota',
      texto:
        'Por isso o histórico é imutável: movimentações não se apagam nem se editam. Corrigir é sempre um novo evento (estorno ou ajuste), com autor e data registrados.',
    },
    { tipo: 'titulo', id: 'conceito-deriva', texto: 'O que deriva de um registro só' },
    {
      tipo: 'paragrafo',
      texto:
        'Cada linha abaixo é UM registro seu. Tudo o que está na coluna da direita acontece sozinho, no mesmo instante — você não digita nada disso em lugar nenhum.',
    },
    {
      tipo: 'tabela',
      colunas: ['Você registra', 'O sistema atualiza sozinho'],
      linhas: [
        [
          'Uma compra',
          'O ativo nasce em estoque na filial que recebeu, já com a primeira linha da linha do tempo e contando no inventário.',
        ],
        [
          'Uma saída para um colaborador',
          'O status do ativo, o colaborador e o setor da ficha, a cobrança do termo na fila de Pendências e as contagens do relatório da semana.',
        ],
        [
          'Uma devolução',
          'O ativo sai do nome da pessoa e vai para conferência; cada acessório marcado como faltante vira uma pendência própria, presa àquela devolução.',
        ],
        [
          'Uma transferência',
          'A filial do ativo — e, com ela, o relatório das duas filiais envolvidas, a de origem e a de destino.',
        ],
        [
          'Um envio à manutenção',
          'O status do ativo e o registro do fornecedor e do chamado, que a ficha e o relatório passam a mostrar enquanto o conserto não volta.',
        ],
        [
          'Um lançamento de item por quantidade',
          'O saldo daquele item na filial, o total, os atrelados e os avisos de falta e de reposição — inclusive o card do painel inicial.',
        ],
      ],
    },
    { tipo: 'titulo', id: 'conceito-anatomia', texto: 'O que fica gravado em cada registro' },
    {
      tipo: 'lista',
      itens: [
        'A data do evento (não a data em que você digitou) e o tipo de movimentação.',
        'O motivo, quando aquele tipo pede motivo — o vocabulário é mantido em Administração › Motivos.',
        'A filial, o colaborador e o setor envolvidos, quando fazem sentido para o tipo.',
        'O número do chamado e a observação livre, quando você os informa.',
        'Quem registrou e o instante do registro — isso nunca é editável.',
        'O estado de onde o ativo saiu e o estado a que ele chegou: é o par de selos "de → para" que a linha do tempo mostra em cada linha.',
      ],
    },
    { tipo: 'titulo', id: 'conceito-errei', texto: 'Errei — e agora?' },
    {
      tipo: 'lista',
      itens: [
        'Acabou de registrar errado: use "Estornar" na linha do tempo. Só a movimentação efetiva mais recente do ativo aceita estorno — a mensagem "Só a última movimentação do ativo pode ser estornada (para casos antigos, use um ajuste com justificativa)." é exatamente essa regra.',
        'O estorno não apaga nada: a movimentação original continua na linha do tempo, riscada e marcada como "estornada", e um novo registro de estorno entra abaixo dela.',
        'Erro antigo, com outras movimentações por cima: use um Ajuste. Ele exige o status resultante e uma justificativa escrita, e fica registrado como qualquer outro evento.',
        'Se o tipo que você quer não aparece na lista, o ativo não está no estado que ele exige. A mensagem "Transição inválida: o ativo não aceita essa movimentação no estado atual." é a mesma regra dita pelo sistema.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'A consequência boa dessa arquitetura: nenhuma tela precisa ser "atualizada" à mão. Registrada a movimentação, a ficha, a lista de ativos, a fila de pendências, os saldos e o relatório ao vivo já estão certos. O que NÃO muda é o que já foi congelado — um relatório gerado e um termo emitido guardam o texto da época.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'tipos-de-movimentacao', texto: `Os ${Object.keys(TIPO_META).length} tipos e o que cada um provoca` },
        { slug: 'status-do-ativo' },
        { slug: 'corrigir-estorno-ajuste' },
        { slug: 'registrar-movimentacao' },
        { slug: 'lancar-itens', texto: 'O mesmo princípio nos itens por quantidade' },
      ],
    },
  ],
}
