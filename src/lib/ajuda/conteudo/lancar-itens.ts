import {
  MAX_LINHAS_LOTE_ITEM,
  MAX_LINHAS_TRANSFERENCIA_ITEM,
  MSG_CHAMADO_OBRIGATORIO,
  TETO_MOTIVO_ESTORNO,
} from '@/lib/validators/item'
import { TIPO_LANCAMENTO_META, type TipoLancamento } from '@/lib/dominio'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import { GRUPOS_ESCOLHA, PERGUNTA_ESCOLHA, TAREFA_DO_TIPO } from '@/lib/itens/escolha-tipo'
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

// Os dois tipos que exigem o numero do chamado sao 'reserva' e 'liberacao'
// (`exigeChamado`, em validators/item.ts). F41: eles SAIRAM da tela — o dialogo nao
// os oferece mais — e vivem so no historico, onde se leem "Reserva" e "Devolucao de
// reserva". Os nomes continuam saindo daqui, e nao da memoria de quem escreve,
// porque e assim que esta pagina acompanha o proximo renome sozinha.
const RESERVA = TIPO_LANCAMENTO_META.reserva.rotulo
const DEVOLUCAO_DE_RESERVA = TIPO_LANCAMENTO_META.liberacao.rotulo

// Os tipos que a tela OFERECE, citados pelo nome nesta pagina. Mesma regra de ouro.
// Repare que o NOME DA CONSTANTE agora bate com o rotulo: antes da F41 havia um
// `const LIBERACAO = ...saida.rotulo` que passou a valer "Saida", e um `DEVOLUCAO`
// que apontava para 'liberacao' — ler o fonte era mais dificil que ler a tela.
const SAIDA = TIPO_LANCAMENTO_META.saida.rotulo
const DEVOLUCAO = TIPO_LANCAMENTO_META.retorno.rotulo
const COMPRA = TIPO_LANCAMENTO_META.entrada.rotulo
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
        'Use o lançamento quando a quantidade de um item mudar: chegou uma caixa de mouses, um teclado saiu com alguém, um carregador voltou. Não use para equipamento com patrimônio — esse tem ficha e movimentação próprias. E não use o Ajuste como atalho para os outros tipos: ele existe para corrigir contagem, com justificativa.',
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
        `Responda "${PERGUNTA_ESCOLHA}" — ${GRUPOS_TEXTO}. São QUATRO botões e uma pergunta só: desde 31/08/2026 o item usa as mesmas palavras do equipamento, então não há mais o que desambiguar. O que sai por ${SAIDA} ("${TAREFA_DO_TIPO.saida}") volta por ${DEVOLUCAO} ("${TAREFA_DO_TIPO.retorno}"), do mesmo jeito que na ficha de um notebook.`,
        `O nome oficial do tipo (${TIPOS_LANCAMENTO_TEXTO}) aparece na pílula colorida logo abaixo da resposta, com o efeito no Total/Estoque — é o mesmo nome do histórico, dos filtros e do relatório. Sem resposta o formulário não grava: ele não chuta tipo nenhum (antes abria pré-marcado em ${TIPO_LANCAMENTO_META.entrada.rotulo}, e o lançamento sem atenção subia o estoque).`,
        `Informe a quantidade e, quando fizer sentido, a pessoa/chamado. ${RESERVA} e ${DEVOLUCAO_DE_RESERVA} exigem o número do chamado (os dois saíram da tela na F41 e só aparecem no histórico); o Ajuste pede justificativa em "Observação (justificativa do ajuste)" e, em vez de digitar o sinal, usa o alternador "${ROTULO_ACRESCENTAR}" / "${ROTULO_BAIXAR}" — o campo só recebe o módulo (sem sinal), o que funciona também no teclado numérico do celular, que não tem tecla de menos. Trocar o tipo para outro que não seja Ajuste some com o sinal negativo pendente na linha.`,
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
        `Filial, tipo, data, chamado, colaborador e observação são COMUNS a todas as linhas — preencha uma vez. As regras do tipo (chamado obrigatório em ${RESERVA}/${DEVOLUCAO_DE_RESERVA}, que hoje só existem no histórico, justificativa no Ajuste) valem para o lançamento inteiro.`,
        'O mesmo item não pode aparecer duas vezes no carrinho: some as quantidades numa linha só.',
        'O lançamento é TUDO OU NADA desde 31/08/2026: se uma linha for recusada, nenhuma é gravada, e o aviso diz qual foi e por quê. Antes cada linha entrava por conta própria e metade do carrinho ficava de pé — o operador saía sem saber o que tinha gravado. Corrija a linha apontada e mande de novo; o carrinho continua montado.',
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
      texto: `Transferir NÃO é dar baixa aqui e entrada lá. "${SAIDA}" tira da prateleira mas mantém o total (o item continua sendo da TI, só está com alguém), então "${SAIDA}" na origem + "${COMPRA}" no destino faz o total da TI CRESCER a cada remanejamento — e nada corrige isso depois. Use "Transferir entre filiais": ele grava o par certo (um "${AJUSTE}" para menos na origem e um para mais no destino), o estoque muda dos dois lados e o total continua exatamente o mesmo.`,
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
        'O histórico tem tela própria desde 31/08/2026: Itens → Histórico, no menu lateral, no botão "Histórico" do topo da página Itens, ou pelo Ctrl+K. Antes ele era a segunda metade da página Itens. Da linha de um item, o menu "⋯" leva direto ao histórico daquele item, já filtrado.',
        'Ele filtra por filial, por item, por tipo de lançamento, por período (De / Até) e por busca (chamado ou colaborador). O filtro de filial é o mesmo das outras listas.',
        'Os filtros ficam na URL: o link já vem filtrado ao ser compartilhado, e voltar/avançar do navegador funciona. Trocar um filtro volta para a primeira página.',
        'A tabela traz "Data" (com o autor do lançamento na dica ao passar o mouse ou focar), "Tipo", "Item", "Qtd.", "Filial", "Chamado", "Colaborador", "Obs." e a coluna de ações. Sem resultado, ela diz "Nenhum lançamento no filtro atual" e sugere ajustar o item, o tipo ou o período.',
        `O sinal da coluna "Qtd." é o efeito na PRATELEIRA: + entra no estoque, − sai. Uma ${TIPO_LANCAMENTO_META.saida.rotulo} de 3 aparece como −3 (três unidades saíram do estoque), mesmo que no registro a quantidade seja o número 3 — o Total só muda com ${TIPO_LANCAMENTO_META.entrada.rotulo} e ${TIPO_LANCAMENTO_META.ajuste.rotulo}. A dica do cabeçalho repete essa régua, e o filtro "Tipo" agrupa as opções pelas mesmas respostas do lançamento (Chegou / Saiu / Voltou / Acerto).`,
        `Com o filtro em EXATAMENTE um item e uma filial, aparece mais uma coluna: "${ROTULO_SALDO_APOS}" — o estoque logo depois de cada lançamento, do mais recente para o mais antigo. Ela reconstrói a partir do saldo atual; se o histórico não fechar com ele (recorte incompleto), a célula mostra "—" em vez de arriscar um número errado.`,
        'O botão "Exportar histórico", no topo da tela, leva para o Excel exatamente o que está filtrado ali — e só o histórico. Os saldos têm o próprio botão, na própria tela: cada uma exporta o seu recorte.',
        'O botão "Ver saldos", ao lado, volta para a lista de itens.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Estornar um lançamento de item',
      itens: [
        'Em Itens → Histórico, use "Estornar" na linha do lançamento errado. O diálogo explica o que vai acontecer: cria o lançamento inverso vinculado (nada é apagado), e o estoque e o reservado voltam ao estado anterior.',
        `O campo "Motivo (opcional)" registra o porquê (até ${TETO_MOTIVO_ESTORNO} caracteres): o texto entra na observação do lançamento inverso, precedido de "Estorno: " — SOMADO ao texto automático que ajuste/entrada já geram, nunca no lugar dele. Nos demais tipos (que antes ficavam sem observação nenhuma), o motivo passa a ser a observação inteira.`,
        'O inverso NÃO é sempre do mesmo tipo: o sistema escolhe o que desfaz aquele efeito — uma Compra é desfeita por um Ajuste negativo (com a observação automática dizendo que é estorno de compra), uma Saída por uma Devolução e vice-versa, e um Ajuste por outro Ajuste de sinal contrário. Quando o que se estorna é um acerto automático, a observação diz isso com todas as letras.',
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
          'A devolução é maior que a quantidade reservada para o chamado.',
          'Está voltando mais do que foi reservado para aquele chamado. Só aparece em lançamento antigo: nenhuma tela cria reserva nova desde 31/08/2026.',
          'Confira o número do chamado e a quantidade original no histórico.',
        ],
        [
          'A devolução é maior que a quantidade que ainda está com as pessoas.',
          'Está voltando mais do que saiu com as pessoas.',
          `Procure o lançamento de ${SAIDA} no histórico e confira a quantidade. Dentro de uma movimentação de equipamento esta recusa não aparece: o sistema acerta a contagem sozinho.`,
        ],
        [
          `${MSG_CHAMADO_OBRIGATORIO}.`,
          `São os dois lançamentos que amarram a peça a um chamado — "${RESERVA}" na ida, "${DEVOLUCAO_DE_RESERVA}" na volta. Sem o número, o par não fecha e a coluna "Falta" acende depois.`,
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
