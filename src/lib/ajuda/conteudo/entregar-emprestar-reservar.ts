import { STATUS_META, TIPO_META } from '@/lib/dominio'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: nenhum rotulo de tipo ou de status e digitado aqui — todos vem
// de TIPO_META/STATUS_META. Se o vocabulario mudar em dominio.ts, este guia muda
// junto no mesmo build.
const T = TIPO_META
const S = STATUS_META

export const entregarEmprestarReservar: PaginaAjuda = {
  slug: 'entregar-emprestar-reservar',
  titulo: 'Entregar, emprestar e reservar',
  resumo: 'As três formas de o equipamento sair da prateleira.',
  categoria: 'fazer',
  termos: ['saida', 'entrega', 'emprestimo', 'reserva', 'colaborador', 'setor'],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `Três tipos tiram o equipamento do estoque, e a diferença entre eles é a expectativa de retorno. Use "${T.saida.rotulo}" quando a entrega é definitiva, "${T.emprestimo.rotulo}" quando o equipamento é cedido por um tempo e vai voltar, e "${T.reserva.rotulo}" quando você só separa o equipamento para alguém — ninguém levou nada ainda. NÃO use nenhum dos três para receber de volta ("${T.devolucao.rotulo}"), para mandar consertar ("${T.envio_manutencao.rotulo}") nem para mudar o equipamento de filial ("${T.transferencia.rotulo}"): cada um desses tem tipo próprio.`,
    },
    {
      tipo: 'tabela',
      colunas: ['Tipo', 'Sai de', 'O ativo fica', 'Campos exigidos', 'Oferece termo?'],
      linhas: [
        [
          T.saida.rotulo,
          `${S.em_estoque.rotulo} · ${S.reservado.rotulo} · ${S.em_triagem.rotulo}`,
          S.em_uso.rotulo,
          '"Motivo *" e "Colaborador" OU "Setor"',
          'Sim',
        ],
        [
          T.emprestimo.rotulo,
          `${S.em_estoque.rotulo} · ${S.reservado.rotulo}`,
          S.emprestado.rotulo,
          '"Motivo *" e "Colaborador" OU "Setor"',
          'Sim',
        ],
        [
          T.reserva.rotulo,
          S.em_estoque.rotulo,
          S.reservado.rotulo,
          'só a "Data" (o resto é opcional)',
          'Não',
        ],
      ],
      legenda: `Um ativo reservado ainda pode virar entrega: dele saem a ${T.saida.rotulo} e o ${T.emprestimo.rotulo}, sem passar de novo pelo estoque.`,
    },
    { tipo: 'titulo', id: 'eer-precondicoes', texto: 'Antes de começar' },
    {
      tipo: 'lista',
      itens: [
        `O ativo precisa estar em um estado que aceite o tipo (a tabela acima). Um equipamento que já está "${S.em_uso.rotulo}" não aceita outra "${T.saida.rotulo}" — ele precisa voltar por "${T.devolucao.rotulo}" antes.`,
        'O catálogo de motivos precisa ter ao menos um motivo aplicável ao tipo escolhido — os motivos são mantidos em Administração › Motivos. Sem nenhum motivo cadastrado para o tipo, o campo "Motivo" nem aparece na tela.',
        `Tenha em mãos o nome do colaborador ou o setor de destino: um dos dois é obrigatório na ${T.saida.rotulo} e no ${T.emprestimo.rotulo}.`,
      ],
    },
    {
      tipo: 'titulo',
      id: 'eer-entregar',
      texto: `Entregar (${T.saida.rotulo}) ou emprestar`,
    },
    {
      tipo: 'passos',
      titulo: 'Entregar ou emprestar um equipamento',
      itens: [
        'Abra "Nova movimentação" (botão amarelo do topo, tecla N, ou o botão "Nova movimentação" da própria ficha do ativo, que já traz o equipamento escolhido).',
        'No passo "Ativos", busque e adicione os equipamentos. Vários de uma vez? Use "Colar lista".',
        `No passo "Movimentação", escolha em "Tipo de movimentação" a opção "${T.saida.rotulo}" ou "${T.emprestimo.rotulo}".`,
        'Preencha "Motivo *" (obrigatório nos dois tipos) e depois "Colaborador" e/ou "Setor" — ao menos um dos dois. Os dois campos sugerem o que já existe no sistema depois de 2 letras; nome novo continua sendo digitado normalmente.',
        '"Chamado (opcional)" aceita só números — é o chamado interno do atendimento.',
        '"Termo de responsabilidade" e "Data do termo" já registram na ficha em que pé está o papel. Deixar como "Não informado" é normal: o documento em si você gera na tela de sucesso, logo depois de registrar.',
        'Confira a "Data" (vem com hoje; os chips "Hoje" e "Ontem" preenchem com um clique) e avance em "Revisar".',
        'Na Revisão, confira o aviso âmbar de "Possível duplicata", se aparecer, e clique em "Registrar".',
        'Na tela de sucesso, gere os termos de responsabilidade em sequência — o botão em destaque é sempre o do próximo pendente.',
      ],
    },
    { tipo: 'titulo', id: 'eer-reservar', texto: 'Reservar sem entregar' },
    {
      tipo: 'passos',
      titulo: 'Reservar um equipamento para alguém',
      itens: [
        `Reserve quando o equipamento já tem dono definido mas ainda não saiu da TI — máquina separada para quem começa na semana que vem, por exemplo. O ativo precisa estar "${S.em_estoque.rotulo}".`,
        `No passo "Movimentação", escolha "${T.reserva.rotulo}". Nenhum campo além da "Data" é obrigatório, mas preencha "Colaborador" (ou "Setor") e "Chamado (opcional)": é o que aparece no card "Reservados" do relatório, na linha "patrimônio · modelo · nº do chamado".`,
        `Registrado, o ativo fica "${S.reservado.rotulo}" e some do que está disponível para entrega — o KPI "Reservados" ("aguardando entrega") sobe e o "${S.em_estoque.rotulo}" desce.`,
        `Quando a pessoa retirar o equipamento, registre a "${T.saida.rotulo}" (ou o "${T.emprestimo.rotulo}") normalmente: o ativo reservado aceita os dois direto, sem voltar ao estoque. É aí que o termo é oferecido.`,
        `A reserva não tem um tipo próprio de cancelamento. Desistiu? Se a reserva for a última movimentação do ativo, use "Estornar" na linha do tempo da ficha; se já houver movimentação depois dela, use "${T.ajuste.rotulo}" com justificativa.`,
      ],
    },
    { tipo: 'titulo', id: 'eer-bastidores', texto: 'O que acontece por trás' },
    {
      tipo: 'lista',
      itens: [
        `${T.saida.rotulo} deixa o ativo "${S.em_uso.rotulo}"; ${T.emprestimo.rotulo}, "${S.emprestado.rotulo}"; ${T.reserva.rotulo}, "${S.reservado.rotulo}". O estado novo aparece na hora na ficha, na lista de ativos e nos KPIs.`,
        'Os três gravam o Colaborador e o Setor informados na ficha do ativo, nos campos "Colaborador" e "Setor" do card "Dados do ativo".',
        `No relatório, a tabela "Saídas" mostra as movimentações de "${T.saida.rotulo}" e de "${T.emprestimo.rotulo}" do período, com as colunas "Motivo", "Chamado", "Colab./Setor" e "Termo". A "${T.reserva.rotulo}" NÃO entra nessa tabela — ela aparece no KPI "Reservados" e no card "Reservados" ("patrimônio · modelo · nº do chamado"), que é a lista de quem está separado esperando entrega.`,
        `Pendência de termo: um ativo entregue abre a pendência "termo" enquanto a assinatura não for confirmada — e isso vale só para quem ficou "${S.em_uso.rotulo}" ou "${S.emprestado.rotulo}". Ativo apenas "${S.reservado.rotulo}" não é cobrado por termo, e ativo que veio do import de startup também não.`,
        'A movimentação entra na linha do tempo da ficha com o estado de → para, o motivo, o destino e o chamado, e na tabela "Saídas" do relatório do período (com as colunas Motivo, Chamado, Colab./Setor e Termo).',
        'Nada disso mexe nos itens por quantidade: mouse, fone e carregador que vão junto com o notebook são lançados à parte, na tela Itens.',
      ],
    },
    { tipo: 'titulo', id: 'eer-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          '"Informe o colaborador ou o setor de destino"',
          `${T.saida.rotulo} e ${T.emprestimo.rotulo} exigem um dos dois. Preencha "Colaborador", "Setor", ou os dois.`,
        ],
        [
          '"Informe o motivo"',
          'O campo "Motivo *" ficou vazio. Se a lista não tiver o motivo certo, cadastre-o em Administração › Motivos marcando o tipo em "Aplica-se a".',
        ],
        [
          `"WAP0001234 (${S.em_uso.rotulo}) não permite “${T.saida.rotulo}” — o tipo foi limpo."`,
          'Um ativo adicionado depois estreitou as opções. Tire esse ativo do lote (ou registre-o em outro lote) e escolha o tipo de novo.',
        ],
        [
          '"Os ativos estão em estados diferentes — só aparecem as movimentações válidas para todos eles."',
          'É um aviso, não um erro: o lote mistura estados e a lista de tipos ficou menor. Separe em dois lotes se o tipo que você quer sumiu.',
        ],
        [
          '"O lote não pode repetir o mesmo ativo. Registre em lotes separados."',
          'O mesmo equipamento entrou duas vezes no lote. Remova a repetição no passo "Ativos".',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'registrar-movimentacao' },
        { slug: 'devolucao-e-triagem', texto: 'Quando o equipamento voltar' },
        { slug: 'termos-de-responsabilidade' },
        { slug: 'tipos-de-movimentacao' },
        { slug: 'corrigir-estorno-ajuste', texto: 'Errou o tipo ou a pessoa?' },
      ],
    },
  ],
}
