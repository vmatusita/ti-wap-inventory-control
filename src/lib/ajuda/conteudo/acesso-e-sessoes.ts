import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const acessoESessoes: PaginaAjuda = {
  slug: 'acesso-e-sessoes',
  titulo: 'Quem acessa o quê',
  resumo:
    'As duas portas: operador com login corporativo e visualizador com senha de acesso.',
  categoria: 'comecar',
  termos: ['login', 'senha', 'visualizador', 'sessao', 'expirou', 'permissao'],
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
    {
      tipo: 'nota',
      texto:
        'As sessões expiram em 24 horas — tanto o operador quanto o visualizador. Dentro da janela, nada interrompe o trabalho; passadas as 24h, o operador refaz o login e o visualizador redigita a senha. Revogar uma senha continua tendo efeito imediato.',
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
      ],
    },
  ],
}
