import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import { verbetesCargo } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// Os dominios aceitos vem da lista real (`DOMINIOS_OPERADOR`): entrar um dominio
// novo la muda esta pagina no mesmo build. Os nomes dos CARGOS vem de
// `PAPEL_ROTULO`/`PAPEL_DESCRICAO` (via `verbetesCargo`) pelo mesmo motivo — sao
// os mesmos rotulos que a tela de usuarios mostra.
export const acessoESessoes: PaginaAjuda = {
  slug: 'acesso-e-sessoes',
  titulo: 'Quem acessa o quê',
  resumo:
    'As duas portas: login corporativo com um dos três cargos e visualizador com senha de acesso.',
  categoria: 'comecar',
  termos: [
    'login',
    'senha',
    'visualizador',
    'sessao',
    'expirou',
    'permissao',
    'gestor',
    'acesso aos relatorios',
    'entrar',
    'cargo',
    'cargos',
    'somente leitura',
    'filiais de escrita',
    'vinculo',
    'desativado',
    'sem permissao',
  ],
  legado: ['acesso'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Há duas portas de entrada, e elas não se confundem. Quem tem LOGIN entra com a conta corporativa e recebe um CARGO, que decide o que ela pode registrar. Quem tem SENHA DE ACESSO entra sem conta nenhuma e só alcança os relatórios.',
    },
    {
      tipo: 'lista',
      itens: [
        `Login — e-mail ${DOMINIOS_TEXTO} e senha própria. Quem entra por aqui LÊ o sistema inteiro, nas cinco filiais; o que varia de pessoa para pessoa é o que ela pode REGISTRAR, e isso vem do cargo (${PAPEL_ROTULO.admin}, ${PAPEL_ROTULO.operador} ou ${PAPEL_ROTULO.consulta}).`,
        'Visualizador — entra por uma senha de acesso e só enxerga os relatórios (/relatorios). Não vê ativos, pendências, esta documentação nem a operação.',
      ],
    },
    {
      tipo: 'nota',
      texto: `Dois nomes parecidos, duas coisas diferentes: o cargo ${PAPEL_ROTULO.consulta} TEM login e navega o sistema inteiro em modo leitura; o visualizador NÃO tem conta e só abre os relatórios. Para quem é da equipe e tem e-mail corporativo, o caminho é o cargo ${PAPEL_ROTULO.consulta}; para quem é de fora da TI, a senha de acesso.`,
    },

    { tipo: 'titulo', id: 'acesso-cargos', texto: 'Os três cargos' },
    {
      tipo: 'paragrafo',
      texto: `O cargo é escolhido por um ${PAPEL_ROTULO.admin} no convite e pode ser mudado depois, sem refazer nada. Ele não muda o que a pessoa VÊ — as cinco filiais, todas as telas fora da Administração, os relatórios e esta documentação estão abertos aos três. Ele muda o que a pessoa REGISTRA.`,
    },
    { tipo: 'glossario', badge: 'neutro', itens: verbetesCargo() },
    {
      tipo: 'tabela',
      colunas: [
        'O que a pessoa quer fazer',
        PAPEL_ROTULO.admin,
        PAPEL_ROTULO.operador,
        PAPEL_ROTULO.consulta,
      ],
      linhas: [
        [
          'Consultar listas, fichas, saldos, relatórios e esta documentação',
          'Todas as filiais',
          'Todas as filiais',
          'Todas as filiais',
        ],
        ['Exportar uma lista para o Excel (CSV)', 'Sim', 'Sim', 'Sim'],
        [
          'Registrar movimentação, compra, devolução ao fornecedor, item, termo, anotação, estorno',
          'Todas as filiais',
          'Só nas filiais vinculadas a ela',
          'Não registra',
        ],
        [
          'Resolver pendência (confirmar assinatura, item faltante, patrimônio, service tag)',
          'Todas as filiais',
          'Só nas filiais vinculadas a ela',
          'Não registra',
        ],
        ['Gerar (congelar) um relatório da semana', 'Sim', 'Sim', 'Não'],
        [
          'Abrir a Administração: usuários, senhas de acesso, filiais, motivos, kits, catálogo de itens',
          'Sim',
          'Não',
          'Não',
        ],
        ['Importar o inventário de uma filial ("Substituir tudo")', 'Sim', 'Não', 'Não'],
      ],
      legenda:
        'Ler é igual para os três cargos; a diferença toda está em registrar. Quem não pode registrar não vê o botão — e, se abrir o endereço na mão, a gravação é recusada com um aviso que explica o motivo.',
    },

    {
      tipo: 'titulo',
      id: 'acesso-filiais',
      texto: `As filiais de escrita do cargo ${PAPEL_ROTULO.operador}`,
    },
    {
      tipo: 'lista',
      itens: [
        `Cada ${PAPEL_ROTULO.operador} tem uma lista de filiais em que pode registrar. Fora dela ele continua vendo tudo, mas a gravação é recusada com um aviso que nomeia a filial.`,
        `Todo ${PAPEL_ROTULO.operador} tem ao menos uma filial: a tela de usuários não deixa salvar o cargo sem nenhuma.`,
        'Nas telas de registro, a lista de filiais oferece só aquelas em que você escreve. Nos filtros de consulta e nos relatórios, as cinco continuam ali.',
        'Transferência entre filiais: basta poder escrever na filial de ORIGEM. Mandar equipamento para outra filial é o fluxo normal — quem recebe é quem opera lá.',
        `${PAPEL_ROTULO.admin} não usa essa lista (escreve em todas as filiais) e ${PAPEL_ROTULO.consulta} também não (não escreve em nenhuma).`,
        'Um lote que junta equipamentos de filiais diferentes é recusado INTEIRO quando você não escreve em uma delas — nada é gravado pela metade.',
      ],
    },

    { tipo: 'titulo', id: 'acesso-operador', texto: 'A porta de quem tem login' },
    {
      tipo: 'lista',
      itens: [
        'A entrada é a tela de login, com "E-mail" e "Senha". Não existe auto-cadastro: a conta nasce de um convite gerado na Administração, e quem aceita o convite define o próprio nome, sobrenome e senha.',
        `Só os domínios corporativos entram: ${DOMINIOS_TEXTO}. Um endereço fora dessa lista é recusado no convite e no login.`,
        'O domínio decide SE a pessoa entra; o cargo decide O QUE ela faz depois. Ninguém escolhe o próprio cargo, nem no primeiro acesso.',
        'Esqueceu a senha: o rodapé do login diz "Esqueceu a senha? Peça a um administrador para reenviar o convite." — o link novo devolve o acesso, e o cargo e as filiais continuam os mesmos.',
      ],
    },
    { tipo: 'titulo', id: 'acesso-visualizador', texto: 'O que o visualizador enxerga' },
    {
      tipo: 'paragrafo',
      texto:
        'Quem recebe uma senha de acesso entra por um endereço próprio, sem conta e sem e-mail: digita a "Senha de acesso" e cai direto no relatório. É o caminho do gestor que só quer acompanhar os números.',
    },
    {
      tipo: 'lista',
      itens: [
        'A tela dele é reduzida: a marca "Estoque TI · Relatórios", os dois destinos "Ao vivo" e "Gerados", a pílula "Visualização" com o rótulo da senha usada e o botão "Sair".',
        'Não há menu lateral, busca global, atalhos de teclado nem o ícone "?": o visualizador NUNCA alcança esta documentação. As explicações de que ele precisa vivem dentro do próprio relatório, na seção "Como ler este relatório" e nas legendas de cada bloco.',
        'O relatório dele se atualiza sozinho a cada 60 segundos e traz um botão "Atualizar" para forçar antes disso.',
        'Ele vê os mesmos números, com três cortes: a seção de pendências não aparece; o patrimônio é texto puro em todo o relatório — nas tabelas e nos cartões de manutenção —, sem link para a ficha do ativo; e, no relatório AO VIVO, os indicadores do topo não são clicáveis para ele, enquanto para quem tem login cada um abre a lista de Ativos já filtrada (num relatório congelado eles não são clicáveis para ninguém).',
        'Ele não tem controle de tema. O seletor "Tema" mora no menu do usuário, que o cabeçalho reduzido não tem — o visualizador vê o tema padrão daquele navegador, que é o claro.',
        'O rodapé da tela de senha tem a saída para quem errou de porta: "É operador da WAP? Entrar com sua conta".',
      ],
    },
    { tipo: 'titulo', id: 'acesso-sessao', texto: 'Quando a sessão acaba' },
    {
      tipo: 'nota',
      texto:
        'As sessões expiram em 24 horas — tanto para quem tem login quanto para o visualizador. Dentro da janela, nada interrompe o trabalho; passadas as 24h, um refaz o login e o outro redigita a senha. Revogar uma senha continua tendo efeito imediato.',
    },
    {
      tipo: 'lista',
      itens: [
        'Sessão vencida no meio do caminho: a tela de login avisa "Sua sessão expirou, entre novamente." e, depois de entrar, você volta ao trabalho.',
        'Acesso desativado: quem foi desativado na tela de usuários cai no login no próximo carregamento de tela, mesmo com a sessão aberta — e, se tentar gravar algo antes disso, lê "Seu acesso foi desativado. Fale com um administrador.". Reativar devolve o acesso do mesmo jeito, no carregamento seguinte.',
        'Cargo rebaixado no meio do expediente: vale também no próximo carregamento. Os botões que o cargo novo não permite desaparecem da tela, e o histórico do que a pessoa já registrou continua intacto.',
        'Senha de acesso revogada: quem a usava perde o acesso no próximo carregamento de tela — não é preciso esperar as 24 horas. A mesma senha pode ser reativada depois, na lista de Administração › Senhas de acesso.',
        'Senha digitada errada: "Senha inválida." Muitas tentativas seguidas: "Muitas tentativas. Aguarde um instante e tente de novo." — espere alguns instantes antes de tentar de novo.',
      ],
    },
    {
      tipo: 'paragrafo',
      texto:
        'Os documentos congelados (snapshots de relatório e termos gerados) guardam o texto da época — corrigir um patrimônio ou confirmar uma assinatura depois NÃO reescreve o que já foi congelado. O relatório ao vivo, sim, sempre reflete o dado atual.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'usuarios-e-senhas', texto: 'Convidar, mudar cargo e entregar senhas de acesso' },
        { slug: 'problemas-import-e-acesso' },
        { slug: 'relatorio-ao-vivo', texto: 'O relatório que o visualizador vê' },
        { slug: 'mapa-das-telas', ancora: 'mapa-tema', texto: 'Onde fica o controle de tema' },
      ],
    },
  ],
}
