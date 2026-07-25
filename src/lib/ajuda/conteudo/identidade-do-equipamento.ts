import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const identidadeDoEquipamento: PaginaAjuda = {
  slug: 'identidade-do-equipamento',
  titulo: 'Patrimônio, service tag e o par que identifica',
  resumo: 'Por que o patrimônio pode repetir e o que nunca muda no equipamento.',
  categoria: 'comecar',
  termos: [
    'patrimonio',
    'service tag',
    'plaqueta',
    'duplicado',
    'copiar',
    'etiqueta',
    'sem patrimonio',
    'identidade',
  ],
  legado: ['acesso'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Identidade do equipamento: a chave de um ativo é o PAR patrimônio + service tag. O patrimônio pode repetir em casos raros, por isso a busca desambigua pela service tag. O formato canônico do patrimônio é PREFIXO + 7 dígitos (ex.: WAP0004491). A service tag nunca muda; o patrimônio pode ser corrigido. Na lista de ativos e na ficha há um botão de copiar ao lado do número: um clique põe o patrimônio (ou a service tag) na área de transferência, para colar no chamado ou no e-mail.',
    },
    { tipo: 'titulo', id: 'identidade-patrimonio', texto: 'O patrimônio: o número da plaqueta' },
    {
      tipo: 'lista',
      itens: [
        'É o número da plaqueta colada no equipamento. O sistema o exibe sempre no formato canônico — prefixo mais 7 dígitos, como WAP0001234 —, em toda tela e em todo arquivo exportado.',
        'Nas buscas você não precisa digitar os zeros nem se preocupar com a caixa: "wap 1234" acha WAP0001234. Já o cadastro manual só aceita o número no formato canônico — colar a plaqueta incompleta ali é recusado.',
        'O patrimônio PODE ser corrigido. Na ficha do ativo, abra o menu "⋯" ("Mais ações") e use "Corrigir patrimônio". A correção fica registrada na linha do tempo (de → para), com seu nome e a data, e a busca passa a achar o ativo pelo número novo.',
        'O número anterior não se perde: ele fica guardado no campo "Patrimônio original" da ficha.',
        'Um ativo pode existir SEM patrimônio: é o caso dos equipamentos que entraram pelo import de startup sem plaqueta. A lista mostra o selo "sem patrimônio" no lugar do número, a ficha mostra "Sem patrimônio" no título e a fila de Pendências cobra a regularização. A ação, aí, chama-se "Definir patrimônio" — no mesmo menu "⋯".',
        'Parte do acervo que veio do import de startup tem plaqueta FORA do formato canônico. Esses números são gravados exatamente como estão na etiqueta e aparecem assim na ficha — ao procurá-los, digite a plaqueta por inteiro, do jeito que a ficha mostra.',
      ],
    },
    { tipo: 'titulo', id: 'identidade-service-tag', texto: 'A service tag: o que nunca muda' },
    {
      tipo: 'lista',
      itens: [
        'É o número de série do fabricante, transcrito exatamente como está na etiqueta do equipamento.',
        'É OBRIGATÓRIA em todo cadastro manual: na compra avulsa, na lista colada, na faixa de patrimônios e no cadastro do equipamento substituto. Só o import de startup aceita linha sem ela — e essas linhas nascem com pendência.',
        'Uma vez definida, é imutável: ela é a identidade do equipamento. Se você tentar trocá-la, o sistema responde "Este ativo já tem service tag — ela é imutável (identidade do equipamento)."',
        'Para o ativo importado que ficou sem tag, a ficha oferece "Definir service tag" no menu "⋯" — e só enquanto o campo estiver vazio. Definida, a ação some da tela e a pendência se encerra.',
      ],
    },
    { tipo: 'titulo', id: 'identidade-duplicado', texto: 'Quando o patrimônio repete' },
    {
      tipo: 'paragrafo',
      texto:
        'Duas plaquetas com o mesmo número existem no acervo real. Como o par patrimônio + service tag é único, o sistema nunca escolhe por você — ele mostra a service tag e espera a sua decisão:',
    },
    {
      tipo: 'lista',
      itens: [
        'Na lista de ativos, a coluna "Service Tag" aparece SÓ quando há patrimônio duplicado no resultado da busca — nas demais buscas ela não ocupa espaço.',
        'Na lista de movimentações, o patrimônio duplicado vem acompanhado do chip "ST" com a service tag ao lado.',
        'Ao montar um lote, a busca de ativos avisa: "Patrimônio duplicado — confira a service tag antes de escolher."',
        'Ao colar uma lista de patrimônios, a linha duplicada é separada em "{patrimônio} — patrimônio duplicado: escolha qual", com o aviso "Nada entra sem escolha. Da próxima vez, cole a service tag na mesma linha para resolver sozinho."',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'A saída definitiva para o duplicado é colar as duas colunas juntas: patrimônio e service tag na mesma linha, separados por vírgula, ponto e vírgula ou TAB. Aí o sistema resolve sozinho, sem perguntar.',
    },
    { tipo: 'titulo', id: 'identidade-copiar', texto: 'Copiar o número sem digitar' },
    {
      tipo: 'paragrafo',
      texto:
        'Onde aparece um patrimônio ou uma service tag, aparece um botão ao lado ("Copiar patrimônio"): um clique põe o número na área de transferência e um aviso confirma. É o caminho para colar no chamado, no e-mail ou na planilha sem errar um dígito — e vale também na ficha, ao lado do "Service Tag".',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'ficha-do-ativo', texto: 'Corrigir o patrimônio e definir a service tag' },
        { slug: 'lista-de-ativos' },
        { slug: 'cadastrar-compra', texto: 'A service tag no cadastro de equipamentos novos' },
        { slug: 'resolver-pendencias', texto: 'Regularizar quem entrou sem plaqueta ou sem tag' },
        { slug: 'import-de-startup' },
      ],
    },
  ],
}
