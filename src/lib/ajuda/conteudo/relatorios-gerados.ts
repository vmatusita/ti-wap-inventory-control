import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const relatoriosGerados: PaginaAjuda = {
  slug: 'relatorios-gerados',
  titulo: 'Os relatórios gerados da semana',
  resumo: 'Gerar o snapshot congelado e achar os anteriores.',
  categoria: 'consultar',
  termos: [
    'snapshot',
    'gerado',
    'semana',
    'congelado',
    'versao',
    'errata',
    'arquivo',
    'historico',
    'regerar',
    'observacao da semana',
  ],
  legado: ['relatorios', 'como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'O SNAPSHOT (relatório gerado) é uma fotografia congelada de um período: fica salvo, versionado e imutável. Serve de registro oficial — "fim da errata", porque nunca muda depois de gerado, mesmo que os dados evoluam. Gerar de novo o mesmo período cria uma nova versão, sem apagar as anteriores.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'Use quando alguém precisa de um número que não se mexe mais: o fecho da semana, o anexo de um e-mail, a prova do que estava no estoque naquele dia. NÃO use para conferir o estoque de agora — para isso existe o relatório ao vivo, que muda a cada movimentação registrada.',
    },
    {
      tipo: 'nota',
      texto:
        'Ao gerar, você pode adicionar uma Observação da semana (texto livre opcional). Ela aparece em destaque no final do snapshot, junto do resumo do período, e é visível para o operador e para o visualizador. Sem observação, nenhuma seção vazia aparece.',
    },
    { tipo: 'titulo', id: 'gerados-gerar', texto: 'Gerar o relatório da semana' },
    {
      tipo: 'paragrafo',
      texto:
        `Pré-condições: ter login com o cargo ${PAPEL_ROTULO.operador} ou ${PAPEL_ROTULO.admin} (quem entra pela senha de acesso lê os snapshots, mas não gera nenhum; o cargo ${PAPEL_ROTULO.consulta} também lê e não gera) e estar na tela do relatório ao vivo da filial que quer congelar — o botão não existe em outro lugar. Congelar qualquer filial não depende da lista de filiais de escrita: quem pode gerar, gera de todas.`,
    },
    {
      tipo: 'passos',
      titulo: 'Gerar um snapshot do relatório',
      itens: [
        'No relatório, use "Gerar relatório". Confira o período (por padrão a semana útil) e o escopo (filial ou geral).',
        'A janela se chama "Gerar relatório da semana". Os campos "De" e "Até" já vêm com a segunda e a sexta da semana corrente; em "Escopo", escolha entre o nome da filial e "Consolidado" (quando você já está no consolidado, não há o que escolher).',
        'Opcionalmente escreva a Observação da semana.',
        'A linha "Será congelado: {alvo} · {de} a {até}." repete o que vai ser gravado — leia antes de confirmar.',
        'Clique em "Gerar e abrir". O aviso "Relatório gerado (versão N)." confirma, e a tela já abre o snapshot novo.',
        'Confirme: o snapshot é salvo, versionado e imutável. Ele aparece no histórico de relatórios gerados.',
      ],
    },
    {
      tipo: 'paragrafo',
      texto:
        'O que acontece por trás: o sistema calcula o estado do acervo no último dia do período (não o de hoje), grava esses números junto do relatório inteiro e os congela. Nada no acervo é alterado — gerar um relatório não mexe em ativo, saldo nem pendência. A partir daí, aquele documento não muda mais, aconteça o que acontecer com os dados.',
    },
    {
      tipo: 'lista',
      itens: [
        'Erros comuns na hora de gerar: "A data inicial não pode ser depois da final." — inverta "De" e "Até".',
        '"A data final não pode ser no futuro." — o teto é hoje ou a sexta da semana corrente, o que for maior.',
        '"Não foi possível gerar o relatório. Verifique sua conexão e tente de novo." — nada foi gravado; tente outra vez.',
      ],
    },
    { tipo: 'titulo', id: 'gerados-versoes', texto: 'Versões: regerar sem apagar' },
    {
      tipo: 'nota',
      texto:
        'Regerar o MESMO período e a MESMA filial não sobrescreve nada: cria a versão seguinte (v1, v2, v3…) e a anterior continua acessível pelo link que você já distribuiu. É assim que se corrige um fecho de semana sem quebrar o que já foi enviado — a versão velha continua contando a história de quando foi gerada. Ao abrir uma versão que não é a última, o próprio snapshot mostra a faixa "Existe a versão N deste relatório — abrir a mais recente.", com um clique para a nova.',
    },
    {
      tipo: 'lista',
      itens: [
        'Cada snapshot abre com a faixa "Relatório gerado · filial · período · versão N · por quem gerou · quando", mais a pílula "dados congelados".',
        'O corpo é o mesmo do relatório ao vivo, com uma diferença deliberada: no snapshot os indicadores do topo NÃO são clicáveis. Eles descrevem o inventário daquele período, e levar para a lista de ativos de hoje seria mostrar outra coisa.',
        'O botão "Imprimir" também existe aqui — e a impressão sai clara mesmo com o tema escuro ligado.',
      ],
    },
    { tipo: 'titulo', id: 'gerados-achar', texto: 'Achar um relatório antigo' },
    {
      tipo: 'passos',
      titulo: 'Encontrar um relatório já gerado',
      itens: [
        'Abra "Relatórios gerados": o botão está no cabeçalho do relatório ao vivo, ao lado de "Gerar relatório". Quem entra pela senha de acesso chega pelo item "Gerados" da barra de cima.',
        'A lista vem do mais recente para o mais antigo (pela data em que foi gerado), com as colunas "Período", "Filial", "Versão", "Gerado por" e "Em".',
        'Use o seletor de filial do cabeçalho para recortar: "Todas as filiais", "Consolidado" ou uma filial específica.',
        'O ícone amarelo ao lado do período significa "Tem observação da semana" — passe o mouse para confirmar antes de abrir.',
        'Clique em "Abrir" na linha desejada. Para voltar ao número de agora, use "Ver ao vivo".',
        'Com a lista vazia aparece "Nenhum relatório gerado ainda" — gere o primeiro na página ao vivo.',
      ],
    },
    { tipo: 'titulo', id: 'gerados-limites', texto: 'O que um snapshot antigo não mostra' },
    {
      tipo: 'nota',
      texto:
        'Um relatório congelado guarda o que existia no formato do dia em que foi gerado — e por isso os mais antigos mostram menos coisa que os de hoje. Nos primeiros, os indicadores do topo saem sem o Δ (a comparação com o período anterior ainda não era gravada). Nos gerados antes da leitura melhorada das tabelas, as linhas estornadas saem sem a marca "estornada", o patrimônio sai como texto puro (sem link para a ficha) e não há o destaque de manutenção parada. Isso não é defeito nem perda de dado: é o congelamento fazendo o que promete. O relatório ao vivo e os snapshots novos têm tudo.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'relatorio-ao-vivo' },
        { slug: 'usuarios-e-senhas', texto: 'Dar acesso ao relatório sem criar conta' },
        { slug: 'mensagens-de-erro' },
      ],
    },
  ],
}
