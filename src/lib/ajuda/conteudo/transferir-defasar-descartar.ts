import { STATUS_META, TIPO_META } from '@/lib/dominio'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: rotulos de tipo e de status vem de dominio.ts, nunca digitados.
const T = TIPO_META
const S = STATUS_META

export const transferirDefasarDescartar: PaginaAjuda = {
  slug: 'transferir-defasar-descartar',
  titulo: 'Transferir, marcar defasado e descartar',
  resumo: 'Mudança de filial e as duas saídas de fim de vida.',
  categoria: 'fazer',
  termos: [
    'transferencia',
    'filial',
    'defasado',
    'descarte',
    'baixa',
    'fim de vida',
    'reserva tecnica',
    'sucata',
  ],
  legado: ['movimentacoes'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `${T.transferencia.rotulo} muda o equipamento de filial sem mexer no estado dele. ${T.marcar_defasado.rotulo} e ${T.descarte.rotulo} encerram a vida útil — o primeiro sinaliza, o segundo dá baixa. Use "${T.marcar_defasado.rotulo}" quando o equipamento ainda está com a WAP mas não deve mais ser distribuído; use "${T.descarte.rotulo}" só quando ele saiu de vez do patrimônio. Equipamento com defeito não vai para nenhum dos dois de cara: vai para "${T.envio_manutencao.rotulo}" primeiro.`,
    },
    {
      tipo: 'tabela',
      colunas: ['Tipo', 'Sai de', 'O ativo fica', 'Campo obrigatório', 'Continua no inventário?'],
      linhas: [
        [
          T.transferencia.rotulo,
          `qualquer estado, menos "${S.descartado.rotulo}" e "${S.devolvido_fornecedor.rotulo}"`,
          'no MESMO estado — só a filial muda',
          '"Filial de destino *"',
          'Sim',
        ],
        [
          T.marcar_defasado.rotulo,
          `${S.em_estoque.rotulo} · ${S.em_triagem.rotulo} · ${S.em_manutencao.rotulo}`,
          S.defasado.rotulo,
          'nenhum além da "Data"',
          'Sim — conta no KPI "Reserva técnica"',
        ],
        [
          T.descarte.rotulo,
          `${S.em_estoque.rotulo} · ${S.em_triagem.rotulo} · ${S.em_manutencao.rotulo} · ${S.defasado.rotulo}`,
          S.descartado.rotulo,
          'nenhum além da "Data"',
          'Não — é baixa definitiva',
        ],
      ],
    },
    { tipo: 'titulo', id: 'tdd-transferir', texto: 'Transferir de filial' },
    {
      tipo: 'passos',
      titulo: 'Transferir um equipamento para outra filial',
      itens: [
        'Abra "Nova movimentação" e adicione os equipamentos no passo "Ativos". A transferência aceita lote: dá para mandar a remessa inteira de uma vez.',
        `No passo "Movimentação", escolha "${T.transferencia.rotulo}". O único campo obrigatório é "Filial de destino *" — não há motivo a preencher.`,
        'Confira a "Data" (é a data em que o equipamento mudou de casa, não a da chegada do e-mail) e registre.',
        `O ativo continua exatamente no mesmo estado: um equipamento "${S.em_uso.rotulo}" transferido segue "${S.em_uso.rotulo}", com o mesmo colaborador. O que muda é o campo "Filial" da ficha.`,
        'Na linha do tempo aparece a linha "Filial:" com a filial de origem → a de destino.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'A transferência é a única movimentação que aparece no relatório das DUAS filiais: a tabela "Transferências" da filial de origem e a da filial de destino mostram a mesma linha, com a coluna "De → Para" dizendo o sentido. No consolidado ela aparece uma vez só. É por isso que transferência não é contada como saída nem como entrada: o equipamento não saiu da WAP, só trocou de prateleira.',
    },
    { tipo: 'titulo', id: 'tdd-defasar', texto: 'Marcar como defasado' },
    {
      tipo: 'passos',
      titulo: 'Marcar um equipamento como defasado',
      itens: [
        `Use quando o equipamento chegou ao fim da vida útil mas continua com a WAP: velho demais para entregar a alguém, guardado como reserva. O ativo precisa estar "${S.em_estoque.rotulo}", "${S.em_triagem.rotulo}" ou "${S.em_manutencao.rotulo}".`,
        `Em "Nova movimentação", escolha "${T.marcar_defasado.rotulo}". Só a "Data" é obrigatória; use "Observação (opcional)" para dizer por quê ("bateria não segura carga", "fora de suporte do fabricante").`,
        `O ativo fica "${S.defasado.rotulo}" e continua no inventário — ele aparece no KPI "Reserva técnica" ("defasados / posse WAP"), tanto no painel inicial quanto no relatório.`,
        'Isso NÃO é baixa: o equipamento continua sendo patrimônio da WAP, continua contando no total de ativos e continua tendo ficha, linha do tempo e filial.',
      ],
    },
    {
      tipo: 'lista',
      itens: [
        `O que um ativo "${S.defasado.rotulo}" NÃO aceita mais: "${T.saida.rotulo}", "${T.emprestimo.rotulo}" e "${T.reserva.rotulo}". Ele não volta a ser distribuído por movimentação normal.`,
        `O que ele ainda aceita: "${T.envio_manutencao.rotulo}" (deu para recuperar), "${T.descarte.rotulo}" (baixa final), "${T.transferencia.rotulo}" (mudou de filial) e "${T.ajuste.rotulo}".`,
        `Voltou a servir? O caminho de volta é o "${T.ajuste.rotulo}", escolhendo "${S.em_estoque.rotulo}" em "Novo status *" e escrevendo a justificativa — ou o conserto: um envio para manutenção seguido do retorno também devolve o equipamento ao estoque.`,
      ],
    },
    { tipo: 'titulo', id: 'tdd-descartar', texto: 'Descartar' },
    {
      tipo: 'passos',
      titulo: 'Dar baixa em um equipamento (descarte)',
      itens: [
        'Use quando o equipamento saiu do patrimônio de vez: sucata, doação, venda, perda. É irreversível pelo fluxo normal — confirme antes de registrar.',
        `O ativo precisa estar "${S.em_estoque.rotulo}", "${S.em_triagem.rotulo}", "${S.em_manutencao.rotulo}" ou "${S.defasado.rotulo}". Equipamento que ainda está com alguém precisa ser devolvido antes.`,
        `Em "Nova movimentação", escolha "${T.descarte.rotulo}", confira a "Data" e use "Observação (opcional)" para registrar o destino (nº do termo de doação, laudo, nota de sucata).`,
        `O ativo fica "${S.descartado.rotulo}" e sai do inventário: some dos KPIs, do estoque por data e do total de ativos. O Colaborador e o Setor da ficha são limpos.`,
        'A ficha e a linha do tempo continuam existindo e acessíveis pela busca — o histórico não se apaga; só o equipamento deixa de contar.',
      ],
    },
    { tipo: 'titulo', id: 'tdd-depois', texto: 'O que não dá para fazer depois' },
    {
      tipo: 'tabela',
      colunas: ['Depois de…', 'Não dá mais para…', 'A saída, se você errou'],
      linhas: [
        [
          T.transferencia.rotulo,
          'nada fica bloqueado — o estado é o mesmo de antes, só em outra filial',
          'transfira de volta, ou estorne se a transferência for a última movimentação',
        ],
        [
          T.marcar_defasado.rotulo,
          `entregar, emprestar ou reservar o equipamento`,
          `estorne, se for a última movimentação; senão, "${T.ajuste.rotulo}" com justificativa`,
        ],
        [
          T.descarte.rotulo,
          `qualquer movimentação, exceto "${T.ajuste.rotulo}" — nem transferência`,
          `estorne, se for a última movimentação; senão, "${T.ajuste.rotulo}" com justificativa`,
        ],
      ],
      legenda: `A mesma regra vale para o estado "${S.devolvido_fornecedor.rotulo}": ele é baixa terminal e só sai por ${T.ajuste.rotulo}.`,
    },
    { tipo: 'titulo', id: 'tdd-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          '"A filial de destino deve ser diferente da filial atual dos ativos."',
          'Um (ou mais) dos equipamentos do lote já está na filial escolhida. Tire-o do lote ou escolha outro destino.',
        ],
        [
          '"Um dos valores informados (motivo ou filial) não existe mais."',
          'A filial de destino foi desativada enquanto você preenchia. Atualize a página e escolha outra.',
        ],
        [
          '"Transição inválida: o ativo não aceita essa movimentação no estado atual."',
          'O estado mudou desde que você montou o lote (alguém movimentou o equipamento). Recarregue e refaça a partir do estado real.',
        ],
        [
          `O tipo "${T.marcar_defasado.rotulo}" ou "${T.descarte.rotulo}" não aparece na lista`,
          `O lote tem algum ativo em estado que não aceita o tipo — o aviso "Os ativos estão em estados diferentes" explica. Separe em lotes por estado.`,
        ],
        [
          'Desativar uma filial não é aceito: "Não é possível desativar: há {n} ativo(s) nesta filial. Transfira-os antes."',
          'Transfira os equipamentos da filial para outra antes de desativá-la em Administração › Filiais.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'tipos-de-movimentacao' },
        { slug: 'registrar-movimentacao' },
        { slug: 'manutencao', texto: 'Antes de descartar, vale consertar?' },
        { slug: 'corrigir-estorno-ajuste', texto: 'Desfazer uma baixa registrada por engano' },
        { slug: 'administracao', texto: 'Cadastro de filiais' },
      ],
    },
  ],
}
