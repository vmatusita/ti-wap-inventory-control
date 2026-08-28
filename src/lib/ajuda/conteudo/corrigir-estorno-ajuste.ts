import { STATUS_META, TIPO_META } from '@/lib/dominio'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: rotulos de tipo e de status vem de dominio.ts, nunca digitados.
const T = TIPO_META
const S = STATUS_META

export const corrigirEstornoAjuste: PaginaAjuda = {
  slug: 'corrigir-estorno-ajuste',
  titulo: 'Corrigir o que ficou errado',
  resumo: 'Quando usar estorno e quando usar ajuste.',
  categoria: 'fazer',
  termos: [
    'estorno',
    'ajuste',
    'errei',
    'desfazer',
    'corrigir',
    'justificativa',
    'estornar',
    'reverter',
    'ajustar',
    'cancelar',
  ],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `Registrou algo errado? Há três caminhos, e a escolha depende do que ficou errado. Se o erro foi a ÚLTIMA movimentação do ativo, use "Estornar" na linha do tempo. Se o erro está mais atrás no histórico, ou se a realidade simplesmente não bate com o sistema, use "${T.ajuste.rotulo}". Se o que está errado é um dado cadastral (memória, hostname, observações), nada disso: é "Editar dados cadastrais" na ficha.`,
    },
    {
      tipo: 'tabela',
      colunas: ['O que ficou errado', 'O caminho', 'Onde fica'],
      linhas: [
        [
          'A movimentação que acabei de registrar',
          '"Estornar"',
          'linha do tempo da ficha, na movimentação mais recente',
        ],
        [
          'Uma movimentação antiga, com outras registradas depois',
          T.ajuste.rotulo,
          'seletor "Tipo de movimentação" da nova movimentação',
        ],
        [
          'O status do ativo não bate com a realidade',
          T.ajuste.rotulo,
          'seletor "Tipo de movimentação" da nova movimentação',
        ],
        [
          'Memória, armazenamento, processador, hostname, observações, termo',
          '"Editar dados cadastrais"',
          'barra de ações da ficha do ativo',
        ],
        [
          'O número do patrimônio ou a service tag',
          '"Corrigir patrimônio" / "Definir service tag"',
          'menu ⋯ ("Mais ações") da ficha do ativo',
        ],
        [
          'Um lançamento de item por quantidade',
          '"Estornar"',
          'coluna "Ações" do histórico de lançamentos, na página Itens',
        ],
      ],
    },
    { tipo: 'titulo', id: 'correcao-estorno', texto: 'Estornar a última movimentação' },
    {
      tipo: 'passos',
      titulo: 'Estornar uma movimentação',
      itens: [
        'Abra a ficha do ativo e vá à linha do tempo.',
        'Só a ÚLTIMA movimentação pode ser estornada — o estorno restaura exatamente o estado anterior.',
        'O botão "Estornar" aparece só naquela linha; se ele não estiver lá, é porque existe movimentação mais recente (ou porque a própria linha já é um estorno, que não se estorna).',
        'O diálogo "Estornar última movimentação" mostra, em "O ativo volta a ser:", o "Status:", o "Colaborador:" e o "Setor:" que serão restaurados — e, quando o que se estorna é uma transferência, também a "Filial:" de origem. Confira essa caixa antes de confirmar: é ela que diz o que vai acontecer.',
        '"Observação (opcional)" guarda o motivo do estorno; o foco já começa em "Cancelar", de propósito, para ninguém confirmar sem ler.',
        'Confirme em "Confirmar estorno". O sistema avisa "Movimentação estornada.".',
        `Precisa desfazer algo do meio do histórico? Use um ${T.ajuste.rotulo} (com justificativa) em vez de estorno.`,
      ],
    },
    {
      tipo: 'lista',
      itens: [
        `O estorno NÃO apaga nada. A movimentação original continua na linha do tempo, riscada, com o link "estornada" que leva ao estorno correspondente; o estorno em si entra como uma linha nova do tipo "${T.estorno.rotulo}".`,
        'Ele devolve o pacote inteiro do estado anterior: status, colaborador, setor, filial, a pendência e o estado do termo como estavam antes.',
        'No relatório, a linha estornada aparece esmaecida e marcada "estornada" — e isso não altera nenhuma contagem. O aviso de possível duplicata também ignora movimentações estornadas.',
        'Um estorno não pode ser estornado: nele não aparecem nem "Estornar" nem "Duplicar".',
      ],
    },
    { tipo: 'titulo', id: 'correcao-ajuste', texto: 'Ajustar com justificativa' },
    {
      tipo: 'passos',
      titulo: 'Corrigir o status com um ajuste',
      itens: [
        `O "${T.ajuste.rotulo}" é a válvula de escape: ele aparece no seletor "Tipo de movimentação" para QUALQUER estado, inclusive "${S.descartado.rotulo}" e "${S.devolvido_fornecedor.rotulo}", de onde nenhum outro tipo sai.`,
        `Abra "Nova movimentação", adicione o ativo e escolha "${T.ajuste.rotulo}".`,
        'Preencha "Novo status *" com o estado que o equipamento realmente tem hoje.',
        'Preencha "Observação * (justificativa)" — é obrigatória e precisa de ao menos 10 caracteres. Escreva o que aconteceu de verdade ("saída lançada na filial errada na semana passada, corrigida por acerto de inventário"): essa frase é o que vai explicar o pulo na linha do tempo daqui a seis meses.',
        'Registre. A linha do tempo mostra o pulo de estado com o rótulo do ajuste, seu nome e a data — o histórico anterior fica intacto.',
        'Use o ajuste também para acertar um lote inteiro que entrou errado e já tem movimentações posteriores: estornar não resolve esses casos, porque o estorno só alcança a última linha.',
      ],
    },
    {
      tipo: 'nota',
      texto: `Ajustar para um estado em que ninguém está com o equipamento — "${S.em_estoque.rotulo}", "${S.em_triagem.rotulo}", "${S.em_manutencao.rotulo}", "${S.defasado.rotulo}", "${S.descartado.rotulo}" ou "${S.devolvido_fornecedor.rotulo}" — LIMPA o colaborador e o setor da ficha. É o que se espera: se o equipamento voltou para a prateleira, ele não está mais com ninguém. Nos três estados em que alguém ESTÁ com ele ("${S.em_uso.rotulo}", "${S.emprestado.rotulo}", "${S.reservado.rotulo}") o ajuste preserva quem está. E "Estornar" continua devolvendo o pacote inteiro, colaborador incluído — é isso que faz desfazer desfazer de verdade.`,
    },
    { tipo: 'titulo', id: 'correcao-cadastro', texto: 'O que o cadastro não corrige' },
    {
      tipo: 'nota',
      texto:
        'O diálogo "Editar dados cadastrais" avisa na própria descrição: "Status, colaborador e filial mudam apenas por movimentação — não são editáveis aqui". Ou seja, não existe caminho de edição direta para o estado do ativo, nem para quem está com ele, nem para a filial: os três só mudam registrando o evento (movimentação, transferência, estorno ou ajuste). É essa disciplina que mantém a linha do tempo confiável — quem lê a ficha vê POR QUE cada coisa mudou, e não só o valor de hoje.',
    },
    { tipo: 'titulo', id: 'correcao-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          '"Só a última movimentação do ativo pode ser estornada (para casos antigos, use um ajuste com justificativa)."',
          'Alguém registrou outra movimentação nesse ativo depois da que você quer desfazer. Use o ajuste.',
        ],
        [
          '"Esta movimentação não pode ser estornada."',
          'A linha escolhida é um estorno, ou é antiga demais e não guardou o estado anterior. Corrija por ajuste.',
        ],
        [
          '"O ajuste exige o status resultante e uma justificativa (observação)."',
          'Preencha "Novo status *" e a "Observação * (justificativa)".',
        ],
        [
          '"A justificativa do ajuste precisa de ao menos 10 caracteres"',
          '"ok" e "erro" não servem. Escreva o que aconteceu — é o que outra pessoa vai ler depois.',
        ],
        [
          '"Não foi possível estornar a movimentação — nada foi estornado. Verifique sua conexão e tente de novo."',
          'A internet caiu no meio do envio. Nada mudou: recarregue a ficha e repita.',
        ],
        [
          '"Este lançamento já foi estornado." / "Um estorno não pode ser estornado."',
          'São mensagens do histórico de itens por quantidade: aquela linha já tem o inverso criado.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'conceito-movimentacao' },
        { slug: 'tipos-de-movimentacao' },
        { slug: 'ficha-do-ativo' },
        { slug: 'lancar-itens', texto: 'Estornar um lançamento de item' },
        { slug: 'mensagens-de-erro' },
      ],
    },
  ],
}
