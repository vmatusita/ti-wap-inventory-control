import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// Os dominios aceitos vem da lista real (`DOMINIOS_OPERADOR`): entrar um dominio
// novo la muda esta pagina no mesmo build.
export const acessoESessoes: PaginaAjuda = {
  slug: 'acesso-e-sessoes',
  titulo: 'Quem acessa o quê',
  resumo:
    'As duas portas: operador com login corporativo e visualizador com senha de acesso.',
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
  ],
  legado: ['acesso'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: 'Há dois modos de acesso, com poderes bem diferentes:',
    },
    {
      tipo: 'lista',
      itens: [
        `Operador — login com e-mail ${DOMINIOS_TEXTO}. Vê e opera tudo. Nível único (não há papéis nem hierarquia de operador).`,
        'Visualizador — entra por uma senha de acesso e só enxerga os relatórios (/relatorios). Não vê ativos, pendências, esta documentação nem a operação.',
      ],
    },
    { tipo: 'titulo', id: 'acesso-operador', texto: 'A porta do operador' },
    {
      tipo: 'lista',
      itens: [
        'A entrada é a tela de login, com "E-mail" e "Senha". Não existe auto-cadastro: a conta nasce de um convite gerado por outro operador em Administração › Usuários, e quem aceita o convite define o próprio nome, sobrenome e senha.',
        `Só os domínios corporativos entram: ${DOMINIOS_TEXTO}. Um endereço fora dessa lista é recusado no convite e no login.`,
        'Nível único: todo operador vê e faz as mesmas coisas. Não há perfil, permissão por tela nem "usuário só de leitura" — quem precisa só acompanhar recebe uma senha de acesso aos relatórios.',
        'Esqueceu a senha: o rodapé do login diz "Esqueceu a senha? Peça a um administrador para reenviar o convite." — outro operador gera um link de acesso novo, e é por ele que você define outra senha.',
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
        'Ele vê os mesmos números, com três cortes: a seção de pendências não aparece; o patrimônio é texto puro em todo o relatório — nas tabelas e nos cartões de manutenção —, sem link para a ficha do ativo; e, no relatório AO VIVO, os indicadores do topo não são clicáveis para ele, enquanto para o operador cada um abre a lista de Ativos já filtrada (num relatório congelado eles não são clicáveis para ninguém).',
        'Ele não tem controle de tema. O seletor "Tema" mora no menu do usuário, que o cabeçalho reduzido não tem — o visualizador vê o tema padrão daquele navegador, que é o claro.',
        'O rodapé da tela de senha tem a saída para quem errou de porta: "É operador da WAP? Entrar com sua conta".',
      ],
    },
    { tipo: 'titulo', id: 'acesso-sessao', texto: 'Quando a sessão acaba' },
    {
      tipo: 'nota',
      texto:
        'As sessões expiram em 24 horas — tanto o operador quanto o visualizador. Dentro da janela, nada interrompe o trabalho; passadas as 24h, o operador refaz o login e o visualizador redigita a senha. Revogar uma senha continua tendo efeito imediato.',
    },
    {
      tipo: 'lista',
      itens: [
        'Sessão vencida no meio do caminho: a tela de login avisa "Sua sessão expirou, entre novamente." e, depois de entrar, você volta ao trabalho.',
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
        { slug: 'usuarios-e-senhas', texto: 'Convidar operadores e entregar senhas de acesso' },
        { slug: 'problemas-import-e-acesso' },
        { slug: 'relatorio-ao-vivo', texto: 'O relatório que o visualizador vê' },
        { slug: 'mapa-das-telas', ancora: 'mapa-tema', texto: 'Onde fica o controle de tema' },
      ],
    },
  ],
}
