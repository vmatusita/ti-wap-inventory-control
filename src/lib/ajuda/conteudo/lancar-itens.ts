import {
  MAX_LINHAS_LOTE_ITEM,
  MAX_LINHAS_TRANSFERENCIA_ITEM,
  MSG_CHAMADO_OBRIGATORIO,
  TETO_MOTIVO_ESTORNO,
} from '@/lib/validators/item'
import { TIPO_LANCAMENTO_META, type TipoLancamento } from '@/lib/dominio'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import {
  GRUPOS_ESCOLHA,
  PERGUNTA_ESCOLHA,
  TAREFA_DO_TIPO,
  grupoPorChave,
} from '@/lib/itens/escolha-tipo'
import { ROTULO_SALDO_APOS } from '@/lib/itens/saldo-apos'
import { ROTULO_ACRESCENTAR, ROTULO_BAIXAR } from '@/lib/itens/sinal-ajuste'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: os nomes dos seis tipos de lancamento NAO sao digitados aqui —
// saem de `TIPO_LANCAMENTO_META`, o mesmo lugar de onde o dialogo os tira. Tipo
// novo (ou rotulo renomeado) aparece nesta frase no mesmo build. O mesmo vale
// para as perguntas da escolha guiada (19/08/2026): grupos e respostas saem de
// `escolha-tipo.ts`, a fonte que o proprio dialogo renderiza.
const TIPOS_LANCAMENTO_TEXTO = (Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[])
  .map((t) => TIPO_LANCAMENTO_META[t].rotulo)
  .join(', ')

const GRUPOS_TEXTO = GRUPOS_ESCOLHA.map((g) => `"${g.rotulo}"`).join(', ')
const SAIU = grupoPorChave('saiu')
const VOLTOU = grupoPorChave('voltou')

// Os dois tipos que exigem o numero do chamado sao 'reserva' e 'liberacao'
// (`exigeChamado`, em validators/item.ts). Na TELA eles se chamam "Atrelar" e
// "Devolucao" — e "Liberacao" e o rotulo de OUTRO tipo ('saida'), que nao pede
// chamado nenhum. Por isso os nomes saem daqui, nao da memoria de quem escreve.
const ATRELAR = TIPO_LANCAMENTO_META.reserva.rotulo
const DEVOLUCAO = TIPO_LANCAMENTO_META.liberacao.rotulo

// F31 — os tres tipos que a secao de TRANSFERENCIA cita pelo nome. Mesma regra de
// ouro: 'saida' se chama "Liberacao" na tela e 'liberacao' se chama "Devolucao";
// digitar esses nomes a mao e como se erra.
const LIBERACAO = TIPO_LANCAMENTO_META.saida.rotulo
const ENTRADA = TIPO_LANCAMENTO_META.entrada.rotulo
const AJUSTE = TIPO_LANCAMENTO_META.ajuste.rotulo

export const lancarItens: PaginaAjuda = {
  slug: 'lancar-itens',
  titulo: 'Lançar itens por quantidade',
  resumo: 'Um lançamento, várias linhas — e criar item sem sair da tela.',
  categoria: 'fazer',
  termos: [
    'lancar',
    'carrinho',
    'nota',
    'entrada',
    'atrelar',
    'liberacao',
    'consumivel',
    'estornar',
    'criar item',
  ],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Use o lançamento quando a quantidade de um item mudar: chegou uma caixa de mouses, um teclado saiu com alguém, uma memória foi atrelada a um chamado. Não use para equipamento com patrimônio — esse tem ficha e movimentação próprias. E não use o Ajuste como atalho para os outros tipos: ele existe para corrigir contagem, com justificativa.',
    },
    {
      tipo: 'lista',
      itens: [
        'Pré-condição: o item precisa estar no catálogo (Administração › Itens). Se não estiver, dá para criá-lo sem sair do lançamento — veja abaixo.',
        'Pré-condição: escolha a filial certa. O saldo é por filial, e o lançamento não se transfere depois: erro de filial se corrige estornando e lançando de novo.',
      ],
    },
    { tipo: 'titulo', id: 'lancar-basico', texto: 'O lançamento do dia a dia' },
    {
      tipo: 'passos',
      titulo: 'Lançar um item por quantidade',
      itens: [
        'Abra Itens pelo menu lateral e use "Lançar" — o diálogo se chama "Lançar quantidade". Dentro da página Itens, a tecla L abre esse mesmo diálogo; fora dela a tecla não faz nada (ela não navega até Itens).',
        'Se o item já aparece na tabela de saldos, use o botão de lançar da própria linha: o formulário abre com o item preenchido e o cursor na quantidade. A filial vem junto quando a tela está no Consolidado com UMA filial marcada no filtro; com duas ou mais marcadas, e na visão Por filial, ela abre em branco (a linha vale para todas) — escolha a filial antes de salvar.',
        'Com a filial escolhida, a lista de itens passa a mostrar o saldo de cada um (ex.: "Mouse USB · 14") — dá para ver antes de escolher às cegas. Sem filial marcada, ou enquanto o saldo ainda carrega, a lista aparece sem o número (nunca com "0" chutado).',
        `Responda "${PERGUNTA_ESCOLHA}" — ${GRUPOS_TEXTO}. Em "${SAIU.rotulo}" e "${VOLTOU.rotulo}" vem a segunda pergunta ("${SAIU.pergunta}" / "${VOLTOU.pergunta}"), e a resposta — pessoa ou chamado — escolhe o par certo sozinha: "${TAREFA_DO_TIPO.saida}" é ${TIPO_LANCAMENTO_META.saida.rotulo} e volta como "${TAREFA_DO_TIPO.retorno}" (${TIPO_LANCAMENTO_META.retorno.rotulo}); "${TAREFA_DO_TIPO.reserva}" é ${TIPO_LANCAMENTO_META.reserva.rotulo} e volta como "${TAREFA_DO_TIPO.liberacao}" (${TIPO_LANCAMENTO_META.liberacao.rotulo}).`,
        `O nome oficial do tipo (${TIPOS_LANCAMENTO_TEXTO}) aparece na pílula colorida logo abaixo da resposta, com o efeito no Total/Estoque — é o mesmo nome do histórico, dos filtros e do relatório. Sem resposta o formulário não grava: ele não chuta tipo nenhum (antes abria pré-marcado em ${TIPO_LANCAMENTO_META.entrada.rotulo}, e o lançamento sem atenção subia o estoque).`,
        `Informe a quantidade e, quando fizer sentido, a pessoa/chamado. ${ATRELAR} e ${DEVOLUCAO} exigem o número do chamado; o Ajuste pede justificativa em "Observação (justificativa do ajuste)" e, em vez de digitar o sinal, usa o alternador "${ROTULO_ACRESCENTAR}" / "${ROTULO_BAIXAR}" — o campo só recebe o módulo (sem sinal), o que funciona também no teclado numérico do celular, que não tem tecla de menos. Trocar o tipo para outro que não seja Ajuste some com o sinal negativo pendente na linha.`,
        'Com item, quantidade, filial e resposta preenchidos, a linha mostra a prévia "Estoque na filial: 14 → 12". Se a operação deixaria a prateleira negativa, a prévia avisa "será recusado (estoque insuficiente)" ali mesmo — antes do envio, não depois.',
        'Confirme em "Lançar". O aviso "Lançamento registrado." confirma; o saldo da tela se atualiza sozinho.',
        '"Repetir último" traz de volta os campos do seu último lançamento — útil para uma sequência de entradas parecidas.',
      ],
    },

    { tipo: 'titulo', id: 'carrinho', texto: 'Vários itens de uma vez' },
    {
      tipo: 'passos',
      titulo: 'Lançar vários itens da mesma nota (carrinho)',
      itens: [
        'Uma nota com 5 itens é UM lançamento com 5 linhas — não é preciso abrir o formulário cinco vezes.',
        `Use "Adicionar item" para incluir uma linha (item + quantidade). O contador ao lado de "Itens" mostra quanto já foi usado do limite de ${MAX_LINHAS_LOTE_ITEM} linhas por lançamento.`,
        `Filial, tipo, data, chamado, colaborador e observação são COMUNS a todas as linhas — preencha uma vez. As regras do tipo (chamado obrigatório em ${ATRELAR}/${DEVOLUCAO}, justificativa no Ajuste) valem para o lançamento inteiro.`,
        'O mesmo item não pode aparecer duas vezes no carrinho: some as quantidades numa linha só.',
        'Cada linha é lançada por conta própria: se uma falhar (saldo insuficiente, por exemplo), as outras entram do mesmo jeito. O aviso diz "X de Y linhas lançadas" e o formulário fica só com as que falharam, com o motivo em cada linha — corrija e mande de novo, sem redigitar o resto.',
        '"Repetir último" e o botão de lançar da linha do saldo preenchem a PRIMEIRA linha do carrinho (e os campos comuns).',
        'Se a rede cair no envio, o aviso é explícito: nenhum lançamento foi registrado. O carrinho continua montado para você repetir.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Criar um item que não está no catálogo (sem sair do lançamento)',
      itens: [
        'Na lista de itens do carrinho, digite o nome do item novo (a partir de 2 letras).',
        'Não achou? Aparece a opção "Criar item «…»" na própria lista — alcançável pelas setas do teclado.',
        'Confirme o nome e escolha o grupo (Acessório ou Componente). A posição do item na tabela é calculada pelo sistema.',
        'O item entra criado e já selecionado naquela linha do carrinho — o lançamento segue sem interrupção. Ele passa a valer para todo mundo (é o mesmo catálogo de Administração › Itens).',
        'Nome que já existe no catálogo não é criado de novo: o sistema avisa "Já existe um item com esse nome." — procure-o na lista. Se o homônimo estiver DESATIVADO, ele é reativado e já entra na linha, com aviso dizendo isso.',
        `Criar (ou reativar) um item mexe no CATÁLOGO, e catálogo é da Administração: isso é dos cargos ${PAPEL_ROTULO.admin} e ${PAPEL_ROTULO.dev}. Com outro cargo, escolha um item que já existe e peça a inclusão do que falta — LANÇAR quantidade continua sendo do cargo ${PAPEL_ROTULO.operador}, nas filiais dele.`,
      ],
    },

    { tipo: 'titulo', id: 'transferir', texto: 'Mover itens de uma filial para outra' },
    {
      tipo: 'nota',
      texto: `Transferir NÃO é dar baixa aqui e entrada lá. "${LIBERACAO}" tira da prateleira mas mantém o total (o item continua sendo da TI, só está com alguém), então "${LIBERACAO}" na origem + "${ENTRADA}" no destino faz o total da TI CRESCER a cada remanejamento — e nada corrige isso depois. Use "Transferir entre filiais": ele grava o par certo (um "${AJUSTE}" para menos na origem e um para mais no destino), o estoque muda dos dois lados e o total continua exatamente o mesmo.`,
    },
    {
      tipo: 'passos',
      titulo: 'Transferir itens entre filiais',
      itens: [
        'Na página Itens, use "Transferir" (ao lado de "Lançar"). O botão só aparece para quem opera em pelo menos DUAS filiais — com uma só não há transferência possível.',
        'Na visão Por filial há um atalho na própria célula: o ícone de setas ao lado do número abre o formulário com o item e a filial de ORIGEM já preenchidos. Ele só aparece nas colunas em que você opera e onde há estoque para mover.',
        'Escolha a filial de origem e a de destino. A origem sai da lista de destinos — a mesma filial dos dois lados é recusada.',
        `Monte a lista de itens (até ${MAX_LINHAS_TRANSFERENCIA_ITEM} por transferência, o mesmo limite do lançamento). Com a origem escolhida, cada item mostra quanto há lá — e a quantidade que passar disso é recusada antes mesmo de enviar. O mesmo item não entra duas vezes: some as quantidades.`,
        'Aqui a quantidade é sempre positiva: quem inverte o sinal do lado da origem é o sistema.',
        'Chamado e observação são opcionais. O que você escrever na observação entra nos DOIS lados, junto do texto automático que diz de onde saiu e para onde foi.',
        'Confirme em "Transferir". É tudo ou nada: se um item não tiver saldo suficiente na origem, NADA é gravado — nem as outras linhas, nem a metade que já teria entrado no destino. Isso é diferente do lançamento em lote, onde cada linha é independente.',
        'No histórico as duas pernas aparecem como Ajuste, marcadas "(transferência (saiu))" e "(transferência (entrou))", com a observação dizendo a outra ponta. Os relatórios não mudam: transferência sempre foi contada como ajuste.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Errou a transferência? Faça a transferência no sentido contrário — é o caminho certo. Estornar UMA das duas pernas pelo histórico desfaz só aquele lado: o outro continua como está e o total consolidado do item muda. O sistema avisa isso no diálogo de estorno, mas não impede — a decisão é sua.',
    },

    { tipo: 'titulo', id: 'historico', texto: 'Depois de lançar' },
    {
      tipo: 'passos',
      titulo: 'Achar um lançamento no histórico de itens',
      itens: [
        'Na página Itens, o histórico filtra por item, por tipo de lançamento, por período (De / Até) e por busca (chamado ou colaborador), além da filial.',
        'Os filtros ficam na URL: o link já vem filtrado ao ser compartilhado, e voltar/avançar do navegador funciona. Trocar um filtro volta para a primeira página.',
        'A tabela traz "Data" (com o autor do lançamento na dica ao passar o mouse ou focar), "Tipo", "Item", "Qtd.", "Filial", "Chamado", "Colaborador", "Obs." e a coluna de ações. Sem resultado, ela diz "Nenhum lançamento no filtro atual" e sugere ajustar o item, o tipo ou o período.',
        `O sinal da coluna "Qtd." é o efeito na PRATELEIRA: + entra no estoque, − sai. Uma ${TIPO_LANCAMENTO_META.saida.rotulo} de 3 aparece como −3 (três unidades saíram do estoque), mesmo que no registro a quantidade seja o número 3 — o Total só muda com ${TIPO_LANCAMENTO_META.entrada.rotulo} e ${TIPO_LANCAMENTO_META.ajuste.rotulo}. A dica do cabeçalho repete essa régua, e o filtro "Tipo" agrupa as opções pelas mesmas respostas do lançamento (Chegou / Saiu / Voltou / Acerto).`,
        `Com o filtro em EXATAMENTE um item e uma filial, aparece mais uma coluna: "${ROTULO_SALDO_APOS}" — o estoque logo depois de cada lançamento, do mais recente para o mais antigo. Ela reconstrói a partir do saldo atual; se o histórico não fechar com ele (recorte incompleto), a célula mostra "—" em vez de arriscar um número errado.`,
        'O botão "Exportar histórico" leva para o Excel exatamente o que está filtrado ali.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Estornar um lançamento de item',
      itens: [
        'No histórico, use "Estornar" na linha do lançamento errado. O diálogo explica o que vai acontecer: cria o lançamento inverso vinculado (nada é apagado), e o estoque e os atrelados voltam ao estado anterior.',
        `O campo "Motivo (opcional)" registra o porquê (até ${TETO_MOTIVO_ESTORNO} caracteres): o texto entra na observação do lançamento inverso, precedido de "Estorno: " — SOMADO ao texto automático que ajuste/entrada já geram, nunca no lugar dele. Nos demais tipos (que antes ficavam sem observação nenhuma), o motivo passa a ser a observação inteira.`,
        'O inverso NÃO é sempre do mesmo tipo: o sistema escolhe o que desfaz aquele efeito — uma Entrada é desfeita por um Ajuste negativo (com a observação automática dizendo que é estorno de entrada), uma Liberação por um Retorno, um Atrelar por uma Devolução e vice-versa, e um Ajuste por outro Ajuste de sinal contrário.',
        'Depois disso, a linha original aparece marcada como "(estornado)" e a nova, como "(estorno)". As duas continuam no histórico — é o rastro de auditoria.',
        'Um estorno não se estorna, e o mesmo lançamento não é estornado duas vezes: o sistema recusa com "Um estorno não pode ser estornado." e "Este lançamento já foi estornado."',
        'Se a rede cair, o aviso afirma o não-efeito ("o lançamento continua como estava") — não repita às cegas: recarregue e confira o histórico.',
      ],
    },

    {
      tipo: 'tabela',
      colunas: ['Mensagem', 'O que significa', 'Como sair'],
      linhas: [
        [
          'Estoque insuficiente: a operação deixaria o item com estoque negativo na prateleira.',
          'A quantidade que sai é maior que a que existe naquela filial.',
          'Confira a filial e o saldo; se a contagem física não bate, corrija com um Ajuste justificado antes.',
        ],
        [
          'A devolução é maior que a quantidade atrelada ao chamado.',
          'Está voltando mais do que foi atrelado àquele chamado.',
          'Confira o número do chamado e a quantidade original no histórico.',
        ],
        [
          'O retorno é maior que a quantidade liberada em aberto.',
          'Está voltando mais do que saiu com as pessoas.',
          'Procure o lançamento de Liberação no histórico e confira a quantidade.',
        ],
        [
          `${MSG_CHAMADO_OBRIGATORIO}.`,
          `São os dois lançamentos que amarram a peça a um chamado — "${ATRELAR}" na ida, "${DEVOLUCAO}" na volta. Sem o número, o par não fecha e a coluna "Falta" acende depois.`,
          'Preencha "Chamado" antes de lançar (só números).',
        ],
        [
          'O ajuste exige uma justificativa (observação).',
          'Ajuste sem o porquê não entra.',
          'Escreva a justificativa no campo de observação do ajuste.',
        ],
        [
          'Ajuste inválido: deixaria o item com total negativo.',
          'A baixa é maior que o total que a TI possui daquele item.',
          'Revise a quantidade — o total nunca fica negativo.',
        ],
      ],
      legenda: 'Recusas mais comuns do lançamento de item.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'itens-por-quantidade', texto: 'O que cada tipo de lançamento faz no saldo' },
        { slug: 'saldos-e-estoque-minimo' },
        { slug: 'administracao', ancora: 'admin-itens', texto: 'O catálogo de itens' },
      ],
    },
  ],
}
