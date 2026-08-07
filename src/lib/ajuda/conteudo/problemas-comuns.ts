import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const problemasComuns: PaginaAjuda = {
  slug: 'problemas-comuns',
  titulo: 'Problemas comuns',
  resumo: 'Sintoma, causa e saída para o que mais trava o dia.',
  categoria: 'resolver',
  termos: [
    'problema',
    'nao acho',
    'nao aparece',
    'travou',
    'duvida',
    'sumiu',
    'vazio',
    'nao gravou',
    'link',
    'duplicado',
  ],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Cada bloco abaixo é um sintoma real da operação, com a causa e a saída. Quando o sistema mostrou uma mensagem escrita, procure primeiro por ela em Mensagens de erro — lá o texto está literal.',
    },
    { tipo: 'titulo', id: 'comuns-achar', texto: 'Não acho o que estou procurando' },
    {
      tipo: 'sintomas',
      itens: [
        {
          sintoma: 'Não encontro o equipamento na busca.',
          causa:
            'A busca precisa de 2 letras e procura por patrimônio, service tag, hostname, marca, modelo, nome do colaborador e — na lista de Ativos — telefone e IMEI. Não procura por outras informações.',
          saida: [
            'Tente pela service tag: ela nunca muda, o patrimônio pode ter sido corrigido.',
            'Tente pelo nome de quem está com o equipamento.',
            'Se o patrimônio veio de uma planilha, digite só os números ("1234"): o sistema completa o formato.',
            'A busca da lista de Ativos, a busca global (Ctrl+K, ⌘K ou a barra "/") e a caixa de ativos do fluxo de nova movimentação procuram todas por service tag e hostname. A da lista vai além e é a única que acha por telefone e por IMEI.',
            'Na lista de Ativos, digitar mais palavras RESTRINGE o resultado (cada palavra precisa casar em algum campo). Para procurar em toda a base, apague a busca e use os filtros "Status", "Filial" e "Categoria".',
          ],
        },
        {
          sintoma:
            'Em Movimentações, a busca pela plaqueta não traz nada — mesmo eu digitando o número certo.',
          causa:
            'A busca de Movimentações é de campo único e decide sozinha, pela forma do que você digitou, se procura por patrimônio ou por colaborador. Plaqueta com letras E números ela reconhece; plaqueta feita só de letras é indistinguível de um nome de pessoa e cai no lado do colaborador.',
          saida: [
            'Confira a nota logo abaixo do campo: ela diz o que o sistema entendeu ("Procurando pelo patrimônio …" ou "Procurando por colaborador que contenha …").',
            'Para plaqueta fora do padrão, digite-a por inteiro, exatamente como está na ficha do ativo.',
            'Quando a plaqueta é só de letras, o caminho é outro: abra a ficha do ativo (pela busca global) e leia a linha do tempo, que traz as mesmas movimentações.',
          ],
        },
        {
          sintoma: 'Dois equipamentos têm o mesmo patrimônio. Qual é o certo?',
          causa:
            'Patrimônio repete em casos raros — a identidade de verdade é o PAR patrimônio + service tag. O sistema não escolhe por você de propósito.',
          saida: [
            'Sempre que houver patrimônio repetido no resultado, a lista de Ativos mostra a coluna "Service Tag" e a lista de Movimentações mostra o chip "ST …" ao lado do número. Compare com a etiqueta do equipamento na sua frente.',
            'Na busca de ativos do fluxo de movimentação aparece o aviso "Patrimônio duplicado — confira a service tag antes de escolher.". Escolha pela linha que traz a service tag certa.',
            'Ao colar uma lista, os duplicados vão para o bloco "{patrimônio} — patrimônio duplicado: escolha qual" e nada entra sem a sua escolha. Da próxima vez, cole a service tag na mesma linha (depois de vírgula, ponto e vírgula ou TAB) e o sistema resolve sozinho.',
          ],
        },
      ],
    },
    { tipo: 'titulo', id: 'comuns-registrar', texto: 'O sistema não deixa registrar' },
    {
      tipo: 'sintomas',
      itens: [
        {
          sintoma: 'O tipo de movimentação que eu quero não aparece na lista.',
          causa:
            'O passo 2 só oferece o que é válido para TODOS os ativos do lote, a partir do estado de cada um. Com estados diferentes no mesmo lote, a lista é a interseção — e aparece o aviso "Os ativos estão em estados diferentes — só aparecem as movimentações válidas para todos eles.".',
          saida: [
            'Confira o status de cada ativo na coluna do passo 1 e separe o lote: um lote por situação.',
            'Se o tipo que falta é Compra, Troca, Devolução ao fornecedor ou Estorno, ele nunca esteve nessa lista — cada um tem caminho próprio (cadastro de equipamento novo, tela de devolução ao fornecedor e botão "Estornar" da linha do tempo).',
            'Se você já tinha escolhido o tipo e ele sumiu ao adicionar um ativo, o aviso nomeia o culpado: "{patrimônio} ({status}) não permite “{tipo}” — o tipo foi limpo.". Tire aquele ativo do lote ou escolha outro tipo.',
            'Quando nada descreve o que aconteceu na vida real, use "Ajuste" com o novo status e a justificativa.',
          ],
        },
        {
          sintoma: 'Eu gerei o termo, mas o ativo continua na fila de Pendências.',
          causa:
            'Gerar o documento não é o mesmo que ter o papel assinado. Enquanto a assinatura não for confirmada, o ativo entregue (Em uso ou Emprestado) continua cobrando o termo.',
          saida: [
            'Na ficha do ativo, use "Confirmar assinatura" e informe a data em que a pessoa assinou. Em Pendências, a mesma ação está no botão da linha, na coluna "Ação".',
            'Confirmou por engano? O botão "Desfazer" ao lado de "Termo assinado" devolve o ativo à fila, e a ação fica na linha do tempo.',
            'O documento assinado em papel não é anexado ao sistema: a confirmação registra a data e quem confirmou.',
          ],
        },
      ],
    },
    { tipo: 'titulo', id: 'comuns-telas', texto: 'A tela não mostra o que eu esperava' },
    {
      tipo: 'sintomas',
      itens: [
        {
          sintoma: 'A tela está vazia e eu sei que existe coisa cadastrada.',
          causa:
            'Quase sempre é filtro ligado — inclusive um que veio no link que você abriu. As telas distinguem os dois casos no próprio texto do vazio: "não há nada cadastrado" e "não há nada NESTE filtro" são frases diferentes.',
          saida: [
            'Leia o título do vazio. "Nenhum ativo cadastrado ainda" é base vazia; "Nenhum ativo com esses filtros" é excesso de recorte — e traz o botão "Limpar filtros".',
            'O mesmo par existe nas outras listas: "Nenhuma movimentação registrada ainda" × "Nenhuma movimentação com esses filtros"; "Nenhum item no catálogo" × "Nenhum item com esses filtros"; "Nenhuma pendência aberta" × "Nenhuma pendência neste filtro".',
            'Em Pendências, o texto do filtro avisa: "Nada nesta combinação de filtros — o que não quer dizer que não haja pendências.". Limpe antes de concluir que a fila zerou.',
            'Nas tabelas do relatório vale a mesma distinção: "Nenhuma saída encontrada com os filtros atuais." é o filtro da tabela; "Nenhuma saída no período." é o período sem movimento.',
            'O botão "Limpar" fica ao lado dos filtros e só apaga filtro: na lista de Ativos a ordenação e o tamanho da página continuam; na página Itens continua a visão escolhida (Consolidado ou Por filial).',
          ],
        },
        {
          sintoma: 'O endereço que me mandaram não abriu a tela certa.',
          causa:
            'Endereço de lista carrega filtro, ordenação, página e período. Um valor estranho é IGNORADO em vez de derrubar a tela — então o que você vê pode ser o padrão, não o que o link prometia.',
          saida: [
            'Página além do fim (um favorito antigo, ou um filtro que encolheu a lista): a tela abre na ÚLTIMA página que existe, e o contador "X de Y" mostra onde você está.',
            'Ordenação, tamanho de página, filial ou data impossíveis: o sistema ignora e usa o padrão. Reaplique os filtros pela própria barra.',
            'Se a tela mostrar "Não foi possível carregar…", use "Tentar novamente"; se falhar sempre, o problema está no endereço — clique em "Limpar filtros" (ou apague tudo depois do "?" no endereço) para recomeçar limpo.',
            'Antes de mandar um link para alguém, abra-o você mesmo numa aba nova: o endereço é a fonte da verdade do que a outra pessoa vai ver.',
          ],
        },
      ],
    },
    { tipo: 'titulo', id: 'comuns-rede', texto: 'Cliquei e parece que não aconteceu nada' },
    {
      tipo: 'sintomas',
      itens: [
        {
          sintoma: 'Cliquei em salvar/registrar e não sei se gravou.',
          causa:
            'Quando a conexão falha no meio de uma ação, o sistema avisa dizendo o que NÃO aconteceu, em vez de sumir em silêncio. Toda gravação é tudo-ou-nada: ou entrou inteira, ou não entrou.',
          saida: [
            'Leia o aviso: ele afirma o não-efeito — "nada foi estornado", "nenhum lançamento foi registrado", "nenhuma pendência foi resolvida", "a senha continua ativa". Nesses casos pode repetir a ação sem risco de duplicar.',
            'No lote de movimentação o aviso é "Não foi possível registrar agora. Seu lote continua aqui — verifique sua conexão e tente de novo.": o lote fica montado na tela, é só tentar de novo.',
            'No cadastro de compra: "Não foi possível cadastrar agora. Os dados continuam preenchidos — verifique sua conexão e tente de novo.".',
            'Se o envio foi parcial, o sistema diz quantas entraram ("N registrada(s); M falhou(aram). Revise os itens restantes.") e mostra os chips "Já registrados" com link para cada ficha. Só o que falhou volta para você corrigir.',
            'Na dúvida, confirme no lugar onde o registro apareceria: a linha do tempo da ficha, a lista de Movimentações ou o histórico de lançamentos.',
          ],
        },
        {
          sintoma: 'A lista de sugestões parou de aparecer enquanto eu digitava.',
          causa:
            'As buscas que rodam enquanto você digita (a caixa de ativos, as sugestões de colaborador, marca e modelo, a busca global) são leituras: quando a rede falha, elas ficam caladas em vez de encher a tela de avisos a cada tecla.',
          saida: [
            'Apague uma letra e digite de novo: a consulta é refeita.',
            'Se continuar sem resultado, confira a conexão e recarregue a página. Nada do que você já digitou no formulário se perde ao usar a busca.',
            'Lembre do mínimo de 2 caracteres: com uma letra só, nenhuma consulta chega a ser feita.',
          ],
        },
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'mensagens-de-erro' },
        { slug: 'problemas-import-e-acesso' },
        { slug: 'identidade-do-equipamento', texto: 'Por que o patrimônio pode repetir' },
        { slug: 'tipos-de-movimentacao', texto: 'Que tipo vale em cada estado' },
      ],
    },
  ],
}
