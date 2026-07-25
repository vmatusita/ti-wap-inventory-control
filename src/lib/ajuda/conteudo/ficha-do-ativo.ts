import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const fichaDoAtivo: PaginaAjuda = {
  slug: 'ficha-do-ativo',
  titulo: 'A ficha do ativo',
  resumo: 'Linha do tempo, anotações e as ações de exceção do menu ⋯.',
  categoria: 'fazer',
  termos: [
    'ficha',
    'detalhe',
    'linha do tempo',
    'anotar',
    'editar',
    'corrigir patrimonio',
    'service tag',
    'mais acoes',
    'substituto',
  ],
  legado: ['como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'A ficha é a página de UM equipamento: tudo que já aconteceu com ele e as ações que agem só sobre ele. Chega-se nela clicando na linha da lista de Ativos, no patrimônio de qualquer lista ou relatório, ou pela busca do teclado. Para agir sobre VÁRIOS equipamentos de uma vez, não use a ficha: o caminho é o lote da nova movimentação.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'O título da ficha é o próprio patrimônio; quando o equipamento não tem plaqueta, o título é "Sem patrimônio", em itálico. Ao lado ficam o selo do status atual, o botão de copiar o número e, quando existe, a service tag com o seu próprio botão de copiar. No alto da página, "Voltar para ativos" devolve você à lista de onde veio, com os filtros que você tinha montado.',
    },

    { tipo: 'titulo', id: 'ficha-acoes', texto: 'A barra de ações' },
    {
      tipo: 'lista',
      itens: [
        '"Nova movimentação" — o botão em destaque. Abre o fluxo de movimentação já com este ativo no lote.',
        '"Devolver ao fornecedor" — aparece SÓ quando o ativo está em manutenção. Leva à tela própria da devolução ao fornecedor.',
        '"Comprar outro igual" — abre o cadastro de equipamento novo com a ficha cadastral copiada. Patrimônio e service tag nunca vêm preenchidos.',
        '"Anotar" — registra um recado na linha do tempo, sem mudar nada no equipamento.',
        '"Editar dados cadastrais" — corrige o que é descrição do aparelho (specs, hostname, observações, termo).',
        '"⋯" (o botão chamado "Mais ações") — guarda as ações de EXCEÇÃO: corrigir/definir o patrimônio e definir a service tag. Elas ficam ali de propósito, para não competir com o botão de movimentação no dia a dia.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Anotar na ficha',
      itens: [
        'Na ficha do ativo, use "Anotar" para registrar uma observação livre. O diálogo se chama "Nova anotação" e serve para recados do tipo "aguardando NF-e" ou "cotação efetuada".',
        'Escreva o texto (até 2.000 caracteres) e confirme em "Anotar".',
        'Anotações são imutáveis e entram na linha do tempo com autor e data. Elas não mudam status, filial nem colaborador — para isso existe a movimentação.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Editar dados cadastrais',
      itens: [
        'Em "Editar dados cadastrais" você altera apenas campos não derivados: "Memória", "Armazenamento", "Processador", "Hostname", "Termo de responsabilidade", "Data do termo" e "Observações".',
        'Status, colaborador, setor, filial e histórico NÃO se editam aqui — eles derivam das movimentações. O próprio diálogo avisa isso.',
        'Confirme em "Salvar". O aviso "Dados cadastrais atualizados." confirma a gravação; se a rede cair, a mensagem diz que nada foi salvo e os campos continuam preenchidos para você tentar de novo.',
      ],
    },

    { tipo: 'titulo', id: 'patrimonio', texto: 'Acertar a identificação' },
    {
      tipo: 'passos',
      titulo: 'Corrigir o patrimônio',
      itens: [
        'Na ficha, abra o menu "⋯" ("Mais ações") — as ações de identificação moram lá, não soltas na barra de botões. O item se chama "Corrigir patrimônio" quando já existe um número e "Definir patrimônio" quando o ativo está sem plaqueta.',
        'Digite o novo número — o sistema mostra ao vivo o formato canônico ("Será gravado como WAP0001234") e avisa quando o valor digitado já é o patrimônio atual ou não tem formato de patrimônio.',
        'A service tag é imutável DEPOIS de preenchida: ela identifica o equipamento e nunca muda. Só o patrimônio se corrige. (Exceção: um ativo importado SEM service tag pode receber a tag uma vez — veja abaixo.)',
        'A correção fica registrada na linha do tempo (de → para, quem, quando). A busca passa a encontrar o ativo pelo novo patrimônio.',
        'Alguns ativos nascem sem patrimônio (equipamento sem plaqueta trazido pelo import de startup): aparecem como "Sem patrimônio", com pendência na lista e em /pendencias. Dar o número aqui encerra essa pendência.',
        'No cadastro manual (novo equipamento ou substituto da devolução ao fornecedor) a service tag é OBRIGATÓRIA. Só o import de startup aceita entrar sem ela: esses ativos nascem com a pendência "sem service tag" — use "Definir service tag", também no menu "⋯", para informá-la (transcrita exatamente como está na etiqueta). Uma vez definida, ela vira imutável, e o item some do menu.',
        'No import de startup, quando o hostname já traz o patrimônio (ex.: NB-WAP0001234), o preview preenche o número sozinho — é um aviso, não um erro, e não impede a importação. Só confira se está certo.',
      ],
    },

    { tipo: 'titulo', id: 'ficha-linha-do-tempo', texto: 'A linha do tempo' },
    {
      tipo: 'lista',
      itens: [
        'Cada evento traz o tipo, a data, o par de status "de → para" e quem registrou. Sem nada registrado, o bloco diz "Nenhuma movimentação registrada para este ativo."',
        'Os detalhes aparecem com o nome do campo na frente: "Motivo:", "Destino:", "Chamado:", "Chamado do fornecedor:", "Filial:" e "Itens faltantes:". A observação vem entre aspas, em itálico.',
        'Movimentação desfeita fica riscada e ganha o link "estornada", que leva ao estorno correspondente. Nada é apagado do histórico.',
        '"Estornar" só aparece na movimentação efetiva mais recente. "Duplicar" abre uma nova movimentação com os mesmos campos, para repetir o mesmo evento em outro equipamento.',
        'Anotações aparecem intercaladas, com o selo "Anotação", o texto e a assinatura de quem escreveu.',
        'Cada evento tem endereço próprio: quem chega por um link que aponta para uma movimentação específica cai nela com a rolagem já posicionada e a linha destacada por um contorno, para não se perder no meio do histórico.',
      ],
    },

    { tipo: 'titulo', id: 'ficha-sucessao', texto: 'Substituto e ativo substituído' },
    {
      tipo: 'paragrafo',
      texto:
        'Quando o fornecedor fica com um equipamento e manda outro no lugar, os dois ficam ligados e a ficha mostra o vínculo nos dois sentidos. Na ficha do novo aparece "Substitui {patrimônio} (devolvido ao fornecedor)"; na do antigo, "Substituído por {patrimônio}". Os dois textos são links para a outra ficha.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'Além disso, a ficha do substituto ganha no fim a seção "Histórico do ativo substituído — {patrimônio}", com a linha do tempo do aparelho antigo em modo de leitura (sem "Estornar" nem "Duplicar"): o texto ali explica que aquelas movimentações pertencem ao ativo devolvido ao fornecedor e estão ali só para consulta. Nenhuma movimentação é copiada de um para o outro.',
    },

    { tipo: 'titulo', id: 'ficha-cards', texto: 'Os cartões da ficha' },
    {
      tipo: 'lista',
      itens: [
        '"Dados do ativo" — "Categoria", "Marca / Modelo", "Specs", "Hostname", "Fornecedor", "Filial", "Colaborador", "Setor", "Termo", "Patrimônio original" e "Origem", mais o bloco "Observações". "Origem" diz de onde o ativo veio: um trazido pelo import de startup aparece como importacao, e é essa origem que dispensa a cobrança de termo.',
        '"Termos" — os termos gerados para este ativo, com quem gerou e quando, e os botões "Editar" e "Baixar". É aqui que se confirma a assinatura, e onde ela se desfaz.',
        '"Itens faltantes da devolução" — os acessórios que não voltaram numa devolução deste ativo. Os abertos trazem o botão "Resolver"; os já resolvidos ficam riscados, com o desfecho, quem resolveu e quando.',
        'Faixa âmbar "Pendência:" — quando o ativo tem uma pendência de identificação em aberto, ela aparece em destaque logo abaixo do cabeçalho.',
      ],
    },

    {
      tipo: 'tabela',
      colunas: ['Situação', 'Por que acontece', 'Como sair'],
      linhas: [
        [
          'O item "Definir service tag" não está no menu "⋯".',
          'O ativo já tem service tag, e ela é imutável.',
          'Confira a tag na linha abaixo do título. Se estiver errada, o caminho é registrar a correção como observação — a tag em si não se reescreve.',
        ],
        [
          '"Este ativo já tem service tag — ela é imutável (identidade do equipamento)."',
          'A tag foi preenchida entre a abertura da ficha e o envio.',
          'Recarregue a ficha: o valor gravado é o que está na tela.',
        ],
        [
          '"Já existe um ativo com esse patrimônio e service tag."',
          'O par que você digitou já identifica outro equipamento.',
          'Confira a etiqueta física; o par patrimônio + service tag é único no sistema inteiro.',
        ],
        [
          'O botão "Estornar" não aparece na movimentação que eu quero desfazer.',
          'Só a movimentação efetiva mais recente pode ser estornada.',
          'Estorne de trás para a frente ou registre um ajuste com justificativa.',
        ],
        [
          '"Não foi possível estornar a movimentação — nada foi estornado."',
          'A rede caiu antes de a operação chegar ao sistema.',
          'A mensagem afirma o não-efeito: nada mudou. Confira a conexão e repita.',
        ],
      ],
      legenda: 'O que trava na ficha e o que fazer em cada caso.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'identidade-do-equipamento' },
        { slug: 'corrigir-estorno-ajuste' },
        { slug: 'resolver-pendencias' },
        { slug: 'lista-de-ativos', ancora: 'ativos-voltar', texto: 'Voltar para a lista sem perder os filtros' },
        { slug: 'manutencao' },
      ],
    },
  ],
}
