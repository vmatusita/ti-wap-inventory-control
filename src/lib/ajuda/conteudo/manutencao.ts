import { STATUS_META, TIPO_META } from '@/lib/dominio'
import { MANUTENCAO_ALERTA_DIAS } from '@/lib/relatorios/manutencao-alerta'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: rotulos de tipo e de status vem de dominio.ts, nunca digitados.
// O limiar do alerta de manutencao parada vem de MANUTENCAO_ALERTA_DIAS — a mesma
// constante que monta o rotulo do chip no relatorio.
const T = TIPO_META
const S = STATUS_META

export const manutencao: PaginaAjuda = {
  slug: 'manutencao',
  titulo: 'Manutenção, do envio à troca',
  resumo:
    'Envio com chamado do fornecedor, retorno, devolução ao fornecedor e substituto.',
  categoria: 'fazer',
  termos: [
    'manutencao',
    'conserto',
    'fornecedor',
    'chamado',
    'troca',
    'substituto',
    'garantia',
    'assistencia',
    'rma',
    'sucessao',
    'consertar',
  ],
  legado: ['movimentacoes'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `Um equipamento que vai para conserto sai do estoque e volta por um de dois caminhos: consertado, ou substituído pelo fornecedor. O ciclo tem três movimentações: "${T.envio_manutencao.rotulo}" (leva para "${S.em_manutencao.rotulo}"), e depois "${T.retorno_manutencao.rotulo}" (voltou consertado, vira "${S.em_estoque.rotulo}") OU "${T.devolucao_fornecedor.rotulo}" (o fornecedor ficou com o equipamento, vira "${S.devolvido_fornecedor.rotulo}"). Use esta página para o conserto com terceiros; um equipamento que apenas envelheceu não vai para manutenção — vai para "${T.marcar_defasado.rotulo}".`,
    },
    { tipo: 'titulo', id: 'manutencao-envio', texto: 'Enviar para manutenção' },
    {
      tipo: 'lista',
      itens: [
        `Antes de começar: o ativo precisa estar "${S.em_estoque.rotulo}", "${S.em_triagem.rotulo}", "${S.em_uso.rotulo}" ou "${S.defasado.rotulo}" — são os quatro estados de onde o envio sai. Um equipamento "${S.emprestado.rotulo}" precisa ser devolvido antes.`,
        'Tenha em mãos o número que o FORNECEDOR deu ao atendimento: o campo "Chamado do fornecedor" é obrigatório e não dá para avançar sem ele.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Enviar um equipamento para manutenção',
      itens: [
        'Abra "Nova movimentação" (tecla N, ou o botão "Nova movimentação" da ficha do ativo) e adicione o equipamento no passo "Ativos".',
        `No passo "Movimentação", escolha "${T.envio_manutencao.rotulo}" em "Tipo de movimentação".`,
        '"Motivo" é opcional e vem do catálogo de Administração › Motivos.',
        '"Chamado (opcional)" é o chamado INTERNO da TI — só números.',
        '"Chamado do fornecedor *" é obrigatório: escreva o identificador que a assistência abriu do lado dela (o campo é texto livre, até 200 caracteres, e o placeholder na tela é "Chamado aberto pelo fornecedor").',
        'Confira a "Data", use "Observação (opcional)" para o defeito relatado ("tela trincada", por exemplo) e conclua em "Revisar" › "Registrar".',
      ],
    },
    {
      tipo: 'titulo',
      id: 'manutencao-chamado-fornecedor',
      texto: 'O que é o "Chamado do fornecedor"',
    },
    {
      tipo: 'nota',
      texto:
        'São dois chamados diferentes, e a tela pede os dois separados de propósito. "Chamado (opcional)" é o chamado INTERNO — o número do atendimento aberto aqui na WAP, por isso só aceita dígitos. "Chamado do fornecedor" é o número que a ASSISTÊNCIA abriu do lado dela: ordem de serviço, protocolo de garantia, número de RMA — o que o fornecedor mandar. Como cada fornecedor usa um formato, o campo é texto livre e não valida nada: transcreva exatamente o que veio. É esse número que você vai citar ao cobrar o conserto, e sem ele o envio não pode ser registrado ("Informe o chamado do fornecedor"). Fornecedor que não dá número? Escreva o que identifica o atendimento — por exemplo "OS por e-mail em dd/MM/aaaa" (com a data do e-mail) ou o nome de quem atendeu. O campo aceita até 200 caracteres ("Chamado do fornecedor: no máximo 200 caracteres").',
    },
    {
      tipo: 'nota',
      texto:
        'Onde esse número reaparece depois de registrado: na linha do tempo da ficha, na linha "Chamado do fornecedor:" daquela movimentação; no relatório, dentro do card "Em manutenção, caso a caso", na linha de apoio de cada caso ("filial · #chamado interno · fornecedor {chamado do fornecedor} · envio dd/MM/aaaa"); e no bloco de contexto da tela de devolução ao fornecedor, já preenchido. Ele NÃO tem coluna própria na lista de ativos nem na de movimentações, não é filtro e não sai no CSV exportado — para achá-lo, abra a ficha do equipamento ou o card de manutenção do relatório.',
    },
    { tipo: 'titulo', id: 'manutencao-acompanhar', texto: 'Acompanhar o conserto' },
    {
      tipo: 'lista',
      itens: [
        `Enquanto está "${S.em_manutencao.rotulo}", o ativo sai do estoque disponível e conta no KPI "${S.em_manutencao.rotulo}" ("conserto/assistência"). O envio também limpa o Colaborador e o Setor da ficha — quem estava com o equipamento não está mais.`,
        `O relatório mostra cada caso no card "${S.em_manutencao.rotulo}, caso a caso" ("{n} caso(s) — envio, anotações e retorno"), com a observação do envio, as anotações e o retorno em ordem.`,
        `O selo "há N dias" começa âmbar e vira VERMELHO a partir de ${MANUTENCAO_ALERTA_DIAS} dias parado — a mesma contagem alimenta o chip "Manutenção parada (${MANUTENCAO_ALERTA_DIAS}+ dias)". Para achar esse chip, abra o relatório da filial (ou o consolidado) e olhe a seção "Pendências" DO RELATÓRIO — é só lá que ele aparece, e só para quem entra com login. Ele NÃO está na página Pendências: aquela tela conta termos pendentes, itens faltantes, ativos aguardando triagem e outras pendências, nunca a manutenção parada.`,
        'Novidade do fornecedor no meio do caminho (previsão, peça sem estoque)? Use "Anotar" na ficha: a anotação entra na linha do tempo com seu nome e a data e aparece no card de manutenção do relatório.',
      ],
    },
    { tipo: 'titulo', id: 'manutencao-retorno', texto: 'Quando o conserto dá certo' },
    {
      tipo: 'passos',
      titulo: 'Registrar o retorno de manutenção',
      itens: [
        `Abra "Nova movimentação" com o equipamento e escolha "${T.retorno_manutencao.rotulo}" — o tipo só aparece para quem está "${S.em_manutencao.rotulo}".`,
        'Preencha a "Data" do retorno e, se quiser, o "Motivo" e a "Observação (opcional)" com o que foi feito (troca de tela, limpeza, peça substituída).',
        `Registrado, o ativo volta para "${S.em_estoque.rotulo}" e fica disponível para uma nova entrega. O card do relatório passa a mostrar o selo verde "voltou em dd/MM/aaaa".`,
        `Voltou, mas não vale mais a pena distribuir? De "${S.em_manutencao.rotulo}" também saem "${T.marcar_defasado.rotulo}" e "${T.descarte.rotulo}" — não é preciso passar pelo estoque antes.`,
      ],
    },
    {
      tipo: 'titulo',
      id: 'manutencao-devolucao-fornecedor',
      texto: 'Quando o fornecedor fica com o equipamento',
    },
    {
      tipo: 'paragrafo',
      texto: `Não teve conserto e o fornecedor ficou com o aparelho (troca em garantia, crédito, estorno)? Isso é a "${T.devolucao_fornecedor.rotulo}", e ela NÃO está no seletor "Tipo de movimentação" da nova movimentação: tem tela própria, porque no mesmo passo você pode cadastrar o equipamento que veio no lugar.`,
    },
    {
      tipo: 'passos',
      titulo: 'Devolver ao fornecedor e cadastrar o substituto',
      itens: [
        `Abra a ficha do equipamento. O botão "Devolver ao fornecedor" só aparece na barra de ações quando o ativo está "${S.em_manutencao.rotulo}" — se não estiver lá, é porque o estado é outro.`,
        `A tela "${T.devolucao_fornecedor.rotulo}" abre com UM ativo só, sempre: não existe devolução ao fornecedor em lote. O subtítulo resume a regra: "O fornecedor ficou com o equipamento (não teve conserto). Registre a baixa e, se houver, cadastre o substituto no mesmo passo."`,
        'No alto, um bloco cinza mostra "Fornecedor", "Chamado interno" e "Chamado do fornecedor" já preenchidos e sem edição, com a nota "Fornecedor e chamados são herdados do envio à manutenção — não se redigitam". Os dois chamados vêm do último envio para manutenção deste equipamento, e o fornecedor vem da ficha. Traço no lugar do valor significa que aquele dado não existe: o chamado interno é opcional, e um equipamento que chegou à manutenção por ajuste (em vez de envio) não tem envio de onde herdar.',
        'Preencha "Data da devolução" — os botões "Hoje" e "Ontem" ao lado do campo preenchem de um clique, como no registro de movimentação — e, se quiser, "Observação (opcional)" ("sem conserto, crédito em garantia…").',
        'O campo "Cadastrar o equipamento substituto" já vem marcado. Deixe marcado quando o fornecedor mandou outro aparelho; DESMARQUE quando ele não repôs — a explicação está na própria linha: "Desmarque se o fornecedor não repôs (crédito/estorno) — só a devolução é registrada".',
        'Com o substituto marcado, preencha o bloco "Equipamento substituto": "Patrimônio *", "Service tag *", "Categoria *", "Filial *", "Marca *" e "Modelo *" são obrigatórios; "Memória", "Armazenamento", "Processador", "Hostname", "Observações do cadastro" e "Observação da entrada (nº da nota etc.)" são opcionais. Categoria, marca, modelo e filial já vêm copiados do equipamento antigo — confira, porque o substituto costuma ser outro modelo.',
        'Clique em "Registrar devolução". É tudo ou nada: se o cadastro do substituto falhar, nem a devolução entra, e a caixa "Nada foi registrado:" lista o motivo.',
        `A tela de sucesso mostra "${T.devolucao_fornecedor.rotulo} registrada" com dois cartões — "${S.devolvido_fornecedor.rotulo}" e "Substituto em estoque" (ou "Sem substituto (fornecedor não repôs)") —, cada um com link para a ficha correspondente.`,
      ],
    },
    {
      tipo: 'titulo',
      id: 'manutencao-substituto',
      texto: `O substituto entra como ${T.troca.rotulo}`,
    },
    {
      tipo: 'nota',
      texto: `O equipamento que o fornecedor mandou no lugar nasce "${S.em_estoque.rotulo}", com uma movimentação de tipo "${T.troca.rotulo}" na linha do tempo — nunca "${T.compra.rotulo}", porque ele não foi comprado. É por isso que "${T.troca.rotulo}" também não aparece no seletor de tipo da nova movimentação: a única forma de gerá-la é esta tela. Na prática: o substituto aparece nas "Entradas" do relatório com a pílula "${T.troca.rotulo}", e NENHUMA contagem de compras o inclui. O fornecedor é copiado do equipamento antigo automaticamente; a data da entrada é a mesma data da devolução.`,
    },
    { tipo: 'titulo', id: 'manutencao-sucessao', texto: 'O vínculo entre os dois ativos' },
    {
      tipo: 'lista',
      itens: [
        'Na ficha do equipamento NOVO aparece a faixa "Substitui WAP0001234 (devolvido ao fornecedor)", com o patrimônio linkado para a ficha do antigo.',
        'Ainda na ficha do novo, abaixo da linha do tempo dele, existe a seção "Histórico do ativo substituído — WAP0001234", com a explicação "As movimentações abaixo pertencem ao ativo devolvido ao fornecedor (ver ficha) — mostradas aqui só para consulta". É a história completa do equipamento antigo à mão, sem sair da ficha do novo — e ela é só leitura: não há "Estornar" nem "Duplicar" ali.',
        'Na ficha do equipamento ANTIGO aparece a faixa "Substituído por WAP0004491", também linkada. Assim se navega nos dois sentidos.',
        'As movimentações NÃO são copiadas de um ativo para o outro: cada uma continua pertencendo ao ativo em que aconteceu. O que existe é o vínculo.',
        'Sem substituto, não há faixa nenhuma — o equipamento antigo fica com a baixa e ponto.',
      ],
    },
    { tipo: 'titulo', id: 'manutencao-bastidores', texto: 'O que acontece por trás' },
    {
      tipo: 'lista',
      itens: [
        `"${S.devolvido_fornecedor.rotulo}" é baixa terminal, igual ao "${S.descartado.rotulo}": o equipamento sai do inventário, dos KPIs e do estoque reconstruído por data. Também some das pendências.`,
        `Desse estado só sai "${T.ajuste.rotulo}" (com justificativa). Nem "${T.transferencia.rotulo}" vale — não se transfere de filial um equipamento que não está mais com a WAP.`,
        'A devolução limpa o Colaborador e o Setor da ficha do equipamento antigo.',
        'O caso deixa de contar como manutenção em aberto: no card do relatório ele passa a exibir o selo cinza "devolvido ao fornecedor em dd/MM/aaaa", e o selo "há N dias" some.',
        `Errou e registrou a devolução sem querer? Se ela for a última movimentação do equipamento antigo, "Estornar" na linha do tempo o devolve para o estado anterior — mas o substituto já cadastrado continua existindo, porque é outro ativo, com ficha própria. Nesse caso dê baixa nele também, por "${T.descarte.rotulo}" ou "${T.ajuste.rotulo}".`,
      ],
    },
    { tipo: 'titulo', id: 'manutencao-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          '"Informe o chamado do fornecedor"',
          'O envio para manutenção não é registrado sem esse campo. Preencha com o identificador que a assistência deu; se não houver número, descreva o atendimento.',
        ],
        [
          '"Chamado do fornecedor: no máximo 200 caracteres"',
          'Resuma. O campo guarda o identificador do atendimento, não o histórico — o resto vai em "Observação" ou numa anotação da ficha.',
        ],
        [
          '"O chamado deve conter apenas números"',
          'Esse erro é do "Chamado (opcional)", o interno. Letras e traços do fornecedor vão no campo "Chamado do fornecedor".',
        ],
        [
          'O botão "Devolver ao fornecedor" não aparece na ficha',
          `Ele só existe enquanto o ativo está "${S.em_manutencao.rotulo}". Registre antes o "${T.envio_manutencao.rotulo}".`,
        ],
        [
          `"A devolução ao fornecedor só vale para um ativo em manutenção — este está “{status}”."`,
          'Alguém já movimentou o equipamento entre a sua abertura da ficha e o clique. Volte à ficha e confira o estado atual.',
        ],
        [
          '"Preencha os dados do substituto: {campos}."',
          'Falta um dos obrigatórios do bloco "Equipamento substituto" — cada campo vazio fica marcado em vermelho, com a mensagem logo abaixo dele, e o foco vai direto para o primeiro. Se o fornecedor não repôs nada, desmarque "Cadastrar o equipamento substituto" em vez de inventar dados.',
        ],
        [
          '"Já existe um ativo com esse patrimônio e service tag nesta filial."',
          'O substituto colide com um equipamento que já está cadastrado. Nada foi registrado — confira a etiqueta e o número antes de repetir.',
        ],
        [
          '"Transição inválida: o ativo não aceita essa movimentação no estado atual."',
          'O estado do ativo mudou no meio do caminho. Recarregue a ficha e refaça a partir do estado real.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'tipos-de-movimentacao' },
        { slug: 'relatorio-ao-vivo', texto: 'Os casos de manutenção no relatório' },
        { slug: 'ficha-do-ativo' },
        { slug: 'transferir-defasar-descartar', texto: 'Quando não vale mais consertar' },
        { slug: 'registrar-movimentacao' },
      ],
    },
  ],
}
