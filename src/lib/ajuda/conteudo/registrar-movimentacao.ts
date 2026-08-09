import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { TIPO_META } from '@/lib/dominio'
import { TIPOS_FORA_DO_LOTE_MANUAL } from '@/lib/validators/movimentacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: o teto vem da constante real e os rotulos de tipo, de TIPO_META.
const T = TIPO_META

// O numeral escrito por extenso — que é como o operador lê — mas DERIVADO do
// tamanho da constante: um caminho próprio novo muda a palavra sozinho.
const POR_EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']
const FORA = POR_EXTENSO[TIPOS_FORA_DO_LOTE_MANUAL.length]

export const registrarMovimentacao: PaginaAjuda = {
  slug: 'registrar-movimentacao',
  titulo: 'Registrar uma movimentação',
  resumo: 'O fluxo em três passos, do lote até a revisão.',
  categoria: 'fazer',
  termos: [
    'nova movimentacao',
    'lote',
    'registrar',
    'rascunho',
    'duplicata',
    'wizard',
    'troca',
    'upgrade',
    'contrapartida',
    'trocar equipamento',
    'substituir equipamento',
  ],
  legado: ['como-fazer', 'movimentacoes'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Este é o caminho de quase tudo que acontece com um equipamento: entregar, emprestar, reservar, receber de volta, aprovar a triagem, mandar consertar, trazer de volta do conserto, transferir de filial, marcar como defasado, descartar e ajustar. A tela é a mesma para um equipamento ou para trinta — e a movimentação é o registro do EVENTO: você conta o que aconteceu, e o estado do ativo, o estoque e o relatório se atualizam sozinhos a partir dela.',
    },
    {
      tipo: 'lista',
      itens: [
        'Antes de começar: o equipamento precisa estar cadastrado. Equipamento novo entra por compra, em "Novo equipamento" — não é aqui.',
        'O tipo que você quer precisa ser válido para o estado ATUAL de todos os ativos do lote. Estados diferentes no mesmo lote encolhem a lista de tipos.',
        'Motivos, filiais e kits vêm dos cadastros de Administração — se faltar uma opção na tela, é lá que ela se cria.',
        'Você é Operador vinculado só a algumas filiais? Um ativo de fora do seu vínculo ganha, assim que entra no lote, o aviso "Você não escreve em {filial} — o registro será recusado". O aviso não impede montar o lote nem avançar de passo — ele avisa cedo o que o registro vai recusar no fim. Administrador e Desenvolvedor nunca veem esse aviso: escrevem em todas as filiais.',
      ],
    },
    { tipo: 'titulo', id: 'registrar-fluxo', texto: 'Os três passos' },
    {
      tipo: 'passos',
      titulo: 'Registrar uma nova movimentação (em lote)',
      itens: [
        'Abra Movimentações › Nova (atalho: tecla N em qualquer tela).',
        `Selecione um ou mais ativos (o lote aceita até ${MAX_LOTE_MOVIMENTACAO} de uma vez). A busca acha por patrimônio, service tag, hostname, marca, modelo ou pelo nome do colaborador — digitar "Fulano da Silva" traz os equipamentos que estão com ele, e o nome aparece na linha do resultado.`,
        'Com o campo de busca ainda vazio, a lista já sugere "Movimentados recentemente" — os últimos ativos que VOCÊ movimentou, que quase sempre são o próximo do dia. Quem já está no lote não aparece na sugestão.',
        'Muitos ativos de uma vez? Use "Colar lista" ao lado da busca em vez de adicionar um a um.',
        'Ou monte o lote antes: na lista de Ativos, filtre, marque as caixinhas das linhas e clique em "Movimentar" — esta tela abre com todos eles já no passo 1. Se algum deles tiver sido apagado no caminho, ou se a seleção passar do teto, um aviso âmbar no topo diz quantos ficaram de fora e por quê.',
        'Escolha o tipo — só aparecem os tipos válidos para o estado de TODOS os ativos escolhidos. Se um ativo adicionado depois estreitar as opções, o sistema avisa qual ativo limpou o tipo.',
        'Preencha os campos pedidos (os obrigatórios variam por tipo) e confirme. Nos campos de data (da movimentação e do termo) há os atalhos "Hoje" e "Ontem" — um clique preenche. Colaborador e Setor sugerem o que já existe no sistema depois de 2 letras (a lista é só atalho: nome novo continua sendo digitado normalmente).',
        'Na Revisão, confira o aviso âmbar de possível duplicata, se aparecer, antes de registrar.',
        'A Revisão mostra um card com o que vai ser gravado (a Data em destaque, e também motivo, colaborador/setor, termo, chamado, observação e status novo — conforme o tipo) e, abaixo, a lista dos ativos do lote (patrimônio e identificação). É a última conferência antes de "Registrar {n} movimentações" — inclusive da data, no lançamento retroativo com "Hoje"/"Ontem".',
        'Com o teclado dá para andar mais rápido: Enter avança do passo 1 para o 2, valida o 2 e registra no 3. Dentro de uma caixa de texto ou de uma lista de opções o Enter não avança — ele faz o que a caixa espera.',
      ],
    },
    {
      tipo: 'titulo',
      id: 'registrar-fora-do-lote',
      texto: `Os ${FORA} tipos que NÃO estão no seletor`,
    },
    {
      tipo: 'nota',
      texto: `O seletor "Tipo de movimentação" mostra só os tipos válidos para o lote — e, mesmo válidos, três nunca aparecem ali, porque têm caminho próprio. "${T.compra.rotulo}": a entrada de equipamento novo é feita em "Novo equipamento" (Ativos › Novo equipamento). "${T.devolucao_fornecedor.rotulo}": tem tela dedicada, aberta pelo botão "Devolver ao fornecedor" da ficha, porque no mesmo passo se cadastra o substituto. "${T.troca.rotulo}": é o nascimento desse substituto e só existe como parte da devolução ao fornecedor. Se você procurou um desses três na lista e não achou, não é falha da tela — é o caminho que é outro. O "${T.estorno.rotulo}" também não está no seletor: ele se dispara pelo botão "Estornar" da linha do tempo.`,
    },
    { tipo: 'titulo', id: 'rascunho', texto: 'Se você sair no meio' },
    {
      tipo: 'passos',
      titulo: 'Retomar um lote que ficou pela metade (rascunho)',
      itens: [
        'Enquanto você monta o lote, a aba guarda um rascunho sozinha: os ativos escolhidos, a configuração e em que passo você parou.',
        'Saiu da tela (inclusive pelo atalho N) ou recarregou a página? Ao voltar aparece o aviso "Você tem um lote não registrado", com Restaurar e Descartar.',
        'O aviso também mostra, quando disponível, alguns dos patrimônios do lote, o tipo de movimentação e há quanto tempo foi salvo — assim dá para reconhecer de relance QUAL rascunho é, sem precisar restaurar para descobrir.',
        'Restaurar re-busca cada ativo no banco na hora — se alguém movimentou um deles nesse meio-tempo, o status vem atualizado e os tipos oferecidos se ajustam; ativo que sumiu do sistema fica de fora, com aviso de quantos ficaram.',
        'O rascunho é só desta aba do navegador e some quando você fecha o navegador. Registrar (mesmo em parte) ou Descartar também o apagam.',
        'Abrir a tela por um link com ativo já escolhido (pela ficha, por "Duplicar" ou pelo "Movimentar" da seleção da lista de ativos) tem prioridade: nesses casos o rascunho não é oferecido.',
      ],
    },
    { tipo: 'titulo', id: 'depois', texto: 'Depois de confirmar' },
    {
      tipo: 'passos',
      titulo: 'Depois de registrar: termos em sequência e sucesso parcial',
      itens: [
        'Registrou uma saída ou empréstimo com vários ativos? A tela de sucesso lista os termos elegíveis com o estado de cada um (pendente / gerado / pulado).',
        'O botão em destaque é sempre o do PRÓXIMO termo pendente: gerou um, o destaque anda sozinho para o seguinte — dá para emitir a sequência inteira sem procurar botão. Pular é permitido e não gera nada.',
        'Esqueceu ou pulou? O termo continua disponível na ficha do ativo e na página Pendências.',
        'Se parte do lote falhar, o formulário volta com as falhas para corrigir — e agora mostra também os chips "Já registrados", com link para a ficha de cada ativo que entrou. O que foi registrado está registrado: não repita esses.',
        'O botão "Registrar outra movimentação" limpa a tela e recomeça do passo 1, sem perder o que já foi gravado.',
        'Vai registrar mais um lote parecido com o mesmo tipo de movimentação? "Registrar outro lote com os mesmos campos" recomeça do passo 1 mantendo tipo, motivo, colaborador/setor, filial de destino, termo, chamado, observação e status novo — só os ativos do lote (e a contrapartida da troca, se houver) são zerados.',
      ],
    },
    {
      tipo: 'titulo',
      id: 'registrar-troca-upgrade',
      texto: 'Trocar o equipamento de alguém numa tela só',
    },
    {
      tipo: 'passos',
      titulo: 'Registrar a troca/upgrade (as duas metades no mesmo "Registrar")',
      itens: [
        `Trocar o equipamento de alguém são sempre duas movimentações: a "${T.devolucao.rotulo}" do antigo e a "${T.saida.rotulo}" do novo, as duas com o motivo "Troca / upgrade" (é o rótulo padrão; Administração › Motivos pode renomeá-lo).`,
        `Monte o lote normalmente e escolha "${T.devolucao.rotulo}" com o motivo "Troca / upgrade": a mesma tela abre a seção "${T.saida.rotulo} da troca", para você escolher o equipamento que entra no lugar.`,
        `Vale igual no outro sentido: "${T.saida.rotulo}" com esse mesmo motivo abre a seção "${T.devolucao.rotulo} da troca". Ali a busca acha o equipamento antigo pelo nome do colaborador — é o caminho mais rápido para achar o que ele tem na mão.`,
        'Quando todos os equipamentos da primeira metade estão com a MESMA pessoa, o campo Colaborador da outra metade já vem preenchido com o nome dela, e continua editável. Estando com pessoas diferentes (ou com ninguém), o campo vem vazio — o sistema não escolhe por você.',
        'Data, Chamado e Observação são os mesmos para as duas metades: um preenchimento só. O motivo da outra metade é fixo e aparece escrito na própria seção.',
        'A Revisão mostra os dois blocos separados, cada um com a sua contagem, e um clique em "Registrar" grava a troca inteira.',
        'Não quer lançar a outra metade agora? Marque "Deixar a contrapartida para depois": só a metade que você montou é registrada, e a tela de sucesso oferece um atalho para lançar a outra em seguida, já com o tipo, o motivo e o colaborador preenchidos. Na tela que esse atalho abre, o aviso não se repete: ali a outra metade já foi registrada.',
        'Duas regras da troca: o mesmo equipamento não pode estar nas duas metades, e o teto do lote conta a SOMA das duas.',
        'Depois de gravadas, as duas movimentações são independentes — estornar uma delas não desfaz a outra.',
      ],
    },
    { tipo: 'titulo', id: 'registrar-bastidores', texto: 'O que acontece por trás' },
    {
      tipo: 'lista',
      itens: [
        'Cada linha do lote vira UMA movimentação, com data, tipo, operador e os campos que você preencheu. É ela que muda o estado do ativo — não existe caminho de edição direta do status.',
        'A ficha do ativo recebe a linha nova na "Linha do tempo", com os selos de → para, e o card "Dados do ativo" já mostra o colaborador, o setor e a filial resultantes.',
        'A movimentação aparece na hora na lista de Movimentações e nos KPIs. No relatório do período, as tabelas detalhadas são por assunto: "Saídas" mostra as entregas e os empréstimos, "Entradas" mostra devoluções, compras e trocas, "Transferências" mostra as mudanças de filial. Os demais tipos não têm tabela própria — eles aparecem nos cards do grupo (o envio e o retorno de manutenção, por exemplo, no card "Em manutenção, caso a caso") e sempre na linha do tempo da ficha.',
        'Pendências entram e saem sozinhas: entrega abre a pendência de termo; devolução com acessório faltando abre uma pendência por item; triagem parada há mais de 7 dias vira pendência também.',
        'O lote é registrado item a item: se um falhar, os outros continuam valendo — por isso existe a caixa "Já registrados" com o que entrou.',
      ],
    },
    { tipo: 'titulo', id: 'registrar-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          '"Revise antes de continuar:" com uma lista',
          'São as validações do passo 2. Cada linha da lista aponta um campo que falta ou está fora do formato.',
        ],
        [
          `"O lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO} itens"`,
          'Tire ativos do lote e registre o resto em um segundo lote — a movimentação em lote tem esse teto.',
        ],
        [
          '"O lote não pode repetir o mesmo ativo. Registre em lotes separados."',
          'O mesmo equipamento aparece duas vezes. Remova a repetição no passo "Ativos".',
        ],
        [
          '"{n} registrada(s); {m} falhou(aram). Revise os itens restantes."',
          'Sucesso parcial. O que entrou está nos chips "Já registrados"; corrija só o que ficou na caixa "Itens que falharam no último envio:".',
        ],
        [
          '"Não foi possível registrar agora. Seu lote continua aqui — verifique sua conexão e tente de novo."',
          'Falha de rede: nada foi registrado e o lote continua montado na tela. Repita quando a conexão voltar.',
        ],
        [
          '"Transição inválida: o ativo não aceita essa movimentação no estado atual."',
          'O estado do ativo mudou depois que você montou o lote. Recarregue a tela e refaça a partir do estado real.',
        ],
        [
          `"Adicione o(s) equipamento(s) da ${T.saida.rotulo.toLowerCase()} da troca — ou marque 'Deixar a contrapartida para depois'."`,
          'A seção da troca está aberta e sem nenhum equipamento. Escolha o que entra no lugar — ou diga que a outra metade fica para depois.',
        ],
        [
          '"{patrimônio} está nas duas metades da troca"',
          'O mesmo equipamento não pode ser devolvido e entregue no mesmo registro. Tire-o de uma das duas seções.',
        ],
        [
          `"As duas metades somam {n} ativos e o lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO}."`,
          'O teto conta o lote inteiro, somando as duas seções. Tire ativos de uma delas e registre o resto num segundo lote.',
        ],
        [
          `"{patrimônio} ({estado}) não permite \\"${T.saida.rotulo}\\" — escolha outro equipamento para a troca."`,
          'O equipamento escolhido para a outra metade não está num estado que aceita aquela movimentação. Escolha outro, ou acerte o estado dele antes.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'colar-e-bipar-lote' },
        { slug: 'kits-de-movimentacao' },
        { slug: 'tipos-de-movimentacao' },
        { slug: 'termos-de-responsabilidade' },
        { slug: 'entregar-emprestar-reservar' },
        {
          slug: 'devolucao-e-triagem',
          texto: 'A devolução, a triagem e a troca vistas do outro lado',
        },
        { slug: 'corrigir-estorno-ajuste' },
      ],
    },
  ],
}
